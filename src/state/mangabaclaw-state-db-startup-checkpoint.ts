import type { DatabaseSync } from "node:sqlite";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import { assertSqliteIntegrity } from "../infra/sqlite-integrity.js";
import { runSqliteImmediateTransactionSync } from "../infra/sqlite-transaction.js";
import { configureSqlitePreSchemaPragmas } from "../infra/sqlite-wal.js";
import {
  MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS,
  type MangabaClawStateDatabaseOptions,
} from "./mangabaclaw-state-db-contract.js";
import {
  assertSupportedSchemaVersion,
  resolveDatabasePath,
} from "./mangabaclaw-state-db-maintenance.js";
import { ensureMangabaClawStatePermissions } from "./mangabaclaw-state-db-permissions.js";
import { ensureColumn } from "./mangabaclaw-state-db-schema-helpers.js";
import {
  assertMangabaClawStateWriteAllowed,
  runWithMangabaClawStateWriteAccess,
} from "./mangabaclaw-state-ownership.js";

function ensureStartupMigrationCheckpointSchema(
  db: DatabaseSync,
  pathname: string,
  env: NodeJS.ProcessEnv,
): void {
  runSqliteImmediateTransactionSync(
    db,
    () => {
      assertMangabaClawStateWriteAllowed({ database: db, databasePath: pathname, env });
      assertSupportedSchemaVersion(db, pathname);
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_meta (
          meta_key TEXT NOT NULL PRIMARY KEY,
          role TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          agent_id TEXT,
          app_version TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS state_leases (
          scope TEXT NOT NULL,
          lease_key TEXT NOT NULL,
          owner TEXT NOT NULL,
          expires_at INTEGER,
          heartbeat_at INTEGER,
          payload_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (scope, lease_key)
        );
        CREATE INDEX IF NOT EXISTS idx_state_leases_expiry
          ON state_leases(expires_at, scope, lease_key)
          WHERE expires_at IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_state_leases_owner
          ON state_leases(owner, updated_at DESC);
      `);
      ensureColumn(db, "schema_meta", "app_version TEXT");
    },
    {
      busyTimeoutMs: MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS,
      databaseLabel: pathname,
      operationLabel: "state.schema.ensure-startup-checkpoint",
    },
  );
}

export function withMangabaClawStateStartupMigrationCheckpointDatabase<T>(
  callback: (db: DatabaseSync) => T,
  options: MangabaClawStateDatabaseOptions = {},
): T {
  const env = options.env ?? process.env;
  const pathname = resolveDatabasePath(options);
  return runWithMangabaClawStateWriteAccess(
    { databasePath: pathname, env },
    "startup migration checkpoint database operation",
    () => {
      ensureMangabaClawStatePermissions(pathname, env);
      const db = openNodeSqliteDatabase(pathname);
      try {
        configureSqlitePreSchemaPragmas(db, {
          busyTimeoutMs: MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS,
        });
        assertSqliteIntegrity(db, pathname);
        ensureStartupMigrationCheckpointSchema(db, pathname, env);
        return callback(db);
      } finally {
        db.close();
        ensureMangabaClawStatePermissions(pathname, env);
      }
    },
  );
}

// One-time seed for the ledger footprint aggregates (#100622): estimate rows
// written before the estimated_bytes columns existed, then roll them up per
// session. Zero is a safe "not seeded" sentinel because every real row costs
// at least its 32-byte overhead.
