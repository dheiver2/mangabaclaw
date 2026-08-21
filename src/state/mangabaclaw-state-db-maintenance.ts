import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  assertSqliteSchemaContains,
  assertSqliteSchemaTablesPresent,
} from "../infra/sqlite-schema-contract.js";
import {
  createNewerSqliteSchemaVersionError,
  readSqliteUserVersion,
} from "../infra/sqlite-user-version.js";
import {
  MANGABACLAW_DATABASE_SCHEMA_DOCS_URL,
  LAZY_ADDITIVE_STATE_TABLES,
  MANGABACLAW_STATE_SCHEMA_VERSION,
  type MangabaClawStateDatabaseOptions,
} from "./mangabaclaw-state-db-contract.js";
import { resolveMangabaClawStateSqlitePath } from "./mangabaclaw-state-db.paths.js";
import { MANGABACLAW_STATE_MAINTENANCE_SCHEMA_COMPATIBILITY } from "./mangabaclaw-state-schema-compatibility.js";
import { MANGABACLAW_STATE_SCHEMA_SQL } from "./mangabaclaw-state-schema.js";

const STATE_V6_ADDITIVE_TABLES = [
  ...LAZY_ADDITIVE_STATE_TABLES,
  "worker_session_tool_operations",
  "worker_turn_tool_authorities",
] as const;
const STATE_V5_ADDITIVE_TABLES = [
  "agent_database_leases",
  "agent_deletion_journal",
  "claw_cron_refs",
  "claw_installs",
  "claw_mcp_server_refs",
  "claw_package_refs",
  "claw_workspace_files",
  "config_machine_state",
  "cron_job_scratch",
  "meeting_transcript_sessions",
  "meeting_transcript_summaries",
  "meeting_transcript_utterances",
  "outbound_media_provenance",
  "worker_environment_credentials",
  "worker_transcript_commit_heads",
  "worker_transcript_commits",
  ...STATE_V6_ADDITIVE_TABLES,
] as const;
const STATE_MIGRATION_ALLOWED_MISSING_TABLES = {
  5: STATE_V5_ADDITIVE_TABLES,
  6: STATE_V6_ADDITIVE_TABLES,
  7: STATE_V6_ADDITIVE_TABLES,
  8: STATE_V6_ADDITIVE_TABLES,
} as const satisfies Record<number, readonly string[]>;
type MangabaClawStateMigrationVersion = keyof typeof STATE_MIGRATION_ALLOWED_MISSING_TABLES;

/** Open shared SQLite database handle plus WAL maintenance lifecycle. */

export function createMangabaClawDatabaseVerificationError(
  kind: "agent" | "state",
  pathname: string,
  storedError: string | null,
): Error {
  // Doctor's clearing hooks run after a full integrity assertion, so a still-
  // corrupt file cannot be cleared directly: the file must be healthy first.
  const error = new Error(
    `MangabaClaw ${kind} database ${pathname} is quarantined after integrity verification failed: ${storedError ?? "unknown integrity error"}. Restore the database from a backup or repair it, then run mangabaclaw doctor --fix to clear the quarantine. See ${MANGABACLAW_DATABASE_SCHEMA_DOCS_URL}.`,
  );
  error.name = "SqliteIntegrityError";
  return error;
}

export function assertSupportedSchemaVersion(db: DatabaseSync, pathname: string): void {
  const userVersion = readSqliteUserVersion(db);
  if (userVersion > MANGABACLAW_STATE_SCHEMA_VERSION) {
    throw createNewerSqliteSchemaVersionError(
      "MangabaClaw state database",
      pathname,
      userVersion,
      MANGABACLAW_STATE_SCHEMA_VERSION,
    );
  }
}

/** Require canonical shared-state ownership without requiring the latest schema. */
export function assertMangabaClawStateDatabaseOwner(
  database: DatabaseSync,
  options: { pathname: string },
): void {
  const hasMetadataTable = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta' LIMIT 1")
    .get();
  const metadata = hasMetadataTable
    ? (database.prepare("SELECT role FROM schema_meta WHERE meta_key = 'primary' LIMIT 1").get() as
        | { role?: unknown }
        | undefined)
    : undefined;
  if (metadata?.role !== "global") {
    const role = typeof metadata?.role === "string" ? metadata.role : "missing";
    throw new Error(
      `MangabaClaw state database ${options.pathname} has schema role ${role}; expected global.`,
    );
  }
}

/** Require the canonical shared-state owner and schema before offline file maintenance. */
export function assertMangabaClawStateDatabaseForMaintenance(
  database: DatabaseSync,
  options: { pathname: string },
): void {
  const userVersion = readSqliteUserVersion(database);
  if (userVersion > MANGABACLAW_STATE_SCHEMA_VERSION) {
    throw createNewerSqliteSchemaVersionError(
      "MangabaClaw state database",
      options.pathname,
      userVersion,
      MANGABACLAW_STATE_SCHEMA_VERSION,
    );
  }
  if (userVersion !== MANGABACLAW_STATE_SCHEMA_VERSION) {
    throw new Error(
      `MangabaClaw state database ${options.pathname} uses schema version ${userVersion}; run mangabaclaw doctor --fix before compacting it.`,
    );
  }

  assertMangabaClawStateDatabaseOwner(database, options);
  const metadata = database
    .prepare("SELECT schema_version FROM schema_meta WHERE meta_key = 'primary' LIMIT 1")
    .get() as { schema_version?: unknown } | undefined;
  if (metadata?.schema_version !== MANGABACLAW_STATE_SCHEMA_VERSION) {
    const schemaVersion =
      typeof metadata?.schema_version === "number" ? metadata.schema_version : "invalid";
    throw new Error(
      `MangabaClaw state database ${options.pathname} metadata schema version ${schemaVersion} does not match ${MANGABACLAW_STATE_SCHEMA_VERSION}; run mangabaclaw doctor --fix before compacting it.`,
    );
  }
  assertSqliteSchemaContains(
    database,
    options.pathname,
    MANGABACLAW_STATE_SCHEMA_SQL,
    MANGABACLAW_STATE_MAINTENANCE_SCHEMA_COMPATIBILITY,
  );
}

function assertMangabaClawStateDatabaseVersionForMigration(
  database: DatabaseSync,
  options: { pathname: string; version: MangabaClawStateMigrationVersion },
): void {
  const userVersion = readSqliteUserVersion(database);
  if (userVersion !== options.version) {
    throw new Error(
      `MangabaClaw state database ${options.pathname} uses schema version ${userVersion}; expected ${options.version} before migrating it.`,
    );
  }
  assertMangabaClawStateDatabaseOwner(database, options);
  const metadata = database
    .prepare("SELECT schema_version FROM schema_meta WHERE meta_key = 'primary' LIMIT 1")
    .get() as { schema_version?: unknown } | undefined;
  if (metadata?.schema_version !== options.version) {
    const schemaVersion =
      typeof metadata?.schema_version === "number" ? metadata.schema_version : "invalid";
    throw new Error(
      `MangabaClaw state database ${options.pathname} metadata schema version ${schemaVersion} does not match ${options.version}; repair the ownership metadata before migrating it.`,
    );
  }
  assertSqliteSchemaTablesPresent(database, options.pathname, MANGABACLAW_STATE_SCHEMA_SQL, {
    allowedMissingTables: STATE_MIGRATION_ALLOWED_MISSING_TABLES[options.version],
  });
}

/** Require every stable v5 table before the v6 additive migration can run. */
export function assertMangabaClawStateDatabaseV5ForMigration(
  database: DatabaseSync,
  options: { pathname: string },
): void {
  assertMangabaClawStateDatabaseVersionForMigration(database, { ...options, version: 5 });
}

/** Require every stable v6 table before the v7 retirement migration can run. */
export function assertMangabaClawStateDatabaseV6ForMigration(
  database: DatabaseSync,
  options: { pathname: string },
): void {
  assertMangabaClawStateDatabaseVersionForMigration(database, { ...options, version: 6 });
}

/** Require every stable v7 table before the v8 placement migration can run. */
export function assertMangabaClawStateDatabaseV7ForMigration(
  database: DatabaseSync,
  options: { pathname: string },
): void {
  assertMangabaClawStateDatabaseVersionForMigration(database, { ...options, version: 7 });
}

/** Require every stable v8 table before the v9 registry migration can run. */
export function assertMangabaClawStateDatabaseV8ForMigration(
  database: DatabaseSync,
  options: { pathname: string },
): void {
  assertMangabaClawStateDatabaseVersionForMigration(database, { ...options, version: 8 });
}

export function resolveDatabasePath(options: MangabaClawStateDatabaseOptions = {}): string {
  return path.resolve(options.path ?? resolveMangabaClawStateSqlitePath(options.env ?? process.env));
}
