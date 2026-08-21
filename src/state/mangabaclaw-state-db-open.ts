import type { DatabaseSync } from "node:sqlite";
import { enableNodeSqliteKyselyStatementCache } from "../infra/kysely-sync.js";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import {
  runWithSqliteBusyTimeout,
  setSqliteBusyTimeout,
  type SqliteLockFailureReporting,
} from "../infra/sqlite-busy-timeout.js";
import {
  assertSqliteIntegrity,
  isTerminalSqliteIntegrityError,
} from "../infra/sqlite-integrity.js";
import { isSqliteSchemaVersionError, readSqliteUserVersion } from "../infra/sqlite-user-version.js";
import {
  configureSqliteConnectionPragmas,
  configureSqlitePreSchemaPragmas,
  type SqliteWalMaintenance,
} from "../infra/sqlite-wal.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  MANGABACLAW_STATE_SCHEMA_VERSION,
  type MangabaClawStateDatabase,
} from "./mangabaclaw-state-db-contract.js";
import { assertSupportedSchemaVersion } from "./mangabaclaw-state-db-maintenance.js";
import { ensureMangabaClawStatePermissions } from "./mangabaclaw-state-db-permissions.js";

const stateDbLog = createSubsystemLogger("state/db");

function assertStateDatabaseIntegrityBeforeMutation(
  database: DatabaseSync,
  pathname: string,
): void {
  const userVersion = readSqliteUserVersion(database);
  const hasApplicationSchema = database // sqlite-allow-raw -- Cold-open schema presence probe before Kysely exposure.
    .prepare("SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1")
    .get();
  const migrationPending =
    (userVersion === 0 && hasApplicationSchema) ||
    (userVersion > 0 && userVersion < MANGABACLAW_STATE_SCHEMA_VERSION);
  if (migrationPending) {
    stateDbLog.info("state database schema migration pending; verifying integrity first", {
      fromVersion: userVersion,
      path: pathname,
      toVersion: MANGABACLAW_STATE_SCHEMA_VERSION,
    });
  }
  if (userVersion !== MANGABACLAW_STATE_SCHEMA_VERSION) {
    // Every physical open proves the full file before schema mutation or exposure.
    assertSqliteIntegrity(database, pathname);
  }
}

export function openUnpublishedStateDatabase(params: {
  pathname: string;
  env: NodeJS.ProcessEnv;
  busyTimeoutMs: number;
  lockFailureReporting: SqliteLockFailureReporting;
  ensureSchema: (database: DatabaseSync) => void;
  recordOpenFailure: (pathname: string, error: Error) => void;
}): MangabaClawStateDatabase {
  const { busyTimeoutMs, lockFailureReporting } = params;
  ensureMangabaClawStatePermissions(params.pathname, params.env);
  const db = openNodeSqliteDatabase(params.pathname);
  enableNodeSqliteKyselyStatementCache(db);
  setSqliteBusyTimeout(db, busyTimeoutMs);
  const walMaintenance = runWithSqliteBusyTimeout(
    db,
    busyTimeoutMs,
    () => {
      let maintenance: SqliteWalMaintenance | undefined;
      try {
        assertSupportedSchemaVersion(db, params.pathname);
        assertStateDatabaseIntegrityBeforeMutation(db, params.pathname);
        configureSqlitePreSchemaPragmas(db, { busyTimeoutMs });
        maintenance = configureSqliteConnectionPragmas(db, {
          busyTimeoutMs,
          databaseLabel: "mangabaclaw-state",
          databasePath: params.pathname,
          foreignKeys: true,
          synchronous: "NORMAL",
        });
        params.ensureSchema(db);
        return maintenance;
      } catch (error) {
        maintenance?.close();
        db.close();
        if (
          error instanceof Error &&
          (isSqliteSchemaVersionError(error) || isTerminalSqliteIntegrityError(error))
        ) {
          params.recordOpenFailure(params.pathname, error);
        }
        throw error;
      }
    },
    { lockFailureReporting },
  );
  ensureMangabaClawStatePermissions(params.pathname, params.env);
  return { db, path: params.pathname, walMaintenance };
}
