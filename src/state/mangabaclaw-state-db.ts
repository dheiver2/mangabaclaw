// MangabaClaw state database manages shared persisted state and migrations.
import { existsSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  clearNodeSqliteKyselyCacheForDatabase,
  executeSqliteQuerySync,
  getNodeSqliteKysely,
} from "../infra/kysely-sync.js";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import {
  normalizeSqliteNonNegativeInteger,
  readSqliteBusyTimeout,
  runWithSqliteBusyTimeout,
  setSqliteBusyTimeout,
  type SqliteLockFailureReporting,
} from "../infra/sqlite-busy-timeout.js";
import { createSqliteLifecycleAggregateError } from "../infra/sqlite-coordinator.js";
import type { SqliteFileGeneration } from "../infra/sqlite-file-generation.js";
import {
  repairCanonicalSqliteIndexes,
  verifyAndRepairCanonicalSqliteIndexes,
} from "../infra/sqlite-index-schema.js";
import {
  assertSqliteIntegrity,
  confirmSqliteFileIntegrity,
  type SqliteIntegrityConfirmation,
} from "../infra/sqlite-integrity.js";
import { prepareSqliteReadOnlyLocation } from "../infra/sqlite-readonly-location.js";
import { assertSqliteSchemaTablesPresent } from "../infra/sqlite-schema-contract.js";
import { migrateSqliteSchemaToStrictInTransaction } from "../infra/sqlite-strict.js";
import {
  isSqliteCorruptionError,
  runSqliteImmediateTransactionSync,
  type SqliteTransactionOptions,
} from "../infra/sqlite-transaction.js";
import { readSqliteUserVersion } from "../infra/sqlite-user-version.js";
import { migrateLegacyCronRunLogsToTaskRuns } from "../infra/state-migrations.cron-run-logs.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { VERSION } from "../version.js";
import { clearMangabaClawDatabaseQuarantine } from "./mangabaclaw-quarantine-store.js";
import { repairAuditEventsSchema } from "./mangabaclaw-state-db-audit-migration.js";
import { mangabaClawStateDatabaseCache as stateDbCache } from "./mangabaclaw-state-db-cache.js";
import {
  MANGABACLAW_DATABASE_SCHEMA_DOCS_URL,
  LAZY_ADDITIVE_STATE_TABLES,
  MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS,
  MANGABACLAW_STATE_SCHEMA_VERSION,
  MANGABACLAW_STATE_STRICT_SCHEMA_VERSION,
  type MangabaClawStateDatabase,
  type MangabaClawStateDatabaseOptions,
} from "./mangabaclaw-state-db-contract.js";
import {
  assertMangabaClawStateDatabaseForMaintenance,
  assertMangabaClawStateDatabaseV5ForMigration,
  assertMangabaClawStateDatabaseV6ForMigration,
  assertMangabaClawStateDatabaseV7ForMigration,
  assertMangabaClawStateDatabaseV8ForMigration,
  assertSupportedSchemaVersion,
  resolveDatabasePath,
} from "./mangabaclaw-state-db-maintenance.js";
import { openUnpublishedStateDatabase } from "./mangabaclaw-state-db-open.js";
import * as operatorApprovalMigration from "./mangabaclaw-state-db-operator-approval-migration.js";
import { ensureMangabaClawStatePermissions } from "./mangabaclaw-state-db-permissions.js";
import {
  ensureAdditiveStateColumns,
  ensureFirstUseAdditiveStateColumnsForStrictMigration,
} from "./mangabaclaw-state-db-schema-additive.js";
import { tableExists } from "./mangabaclaw-state-db-schema-helpers.js";
import {
  type AgentDatabasePathMigrationSummary as AgentPathSummary,
  assertCanonicalStateSchemaShape,
  detectMangabaClawStateDatabaseSchemaMigrationsFromDatabase,
  dropLegacyStateTables,
  markCurrentStateSchemaVersion,
  migrateAgentDatabaseRelativePaths as migrateAgentPaths,
  migrateRetiredCommitmentsSchema,
  migrateWorkerPlacementExecutionModeSchema,
  repairAgentDatabasesCompositePrimaryKey,
  repairLegacyGatewayRestartHandoffsForStrictMigration,
} from "./mangabaclaw-state-db-schema-repair.js";
import * as sessionWatchMigration from "./mangabaclaw-state-db-session-watch-migration.js";
import type { DB as MangabaClawStateKyselyDatabase } from "./mangabaclaw-state-db.generated.js";
import { describeAgentPathMigration, warnAgentPathMigration } from "./mangabaclaw-state-db.paths.js";
import {
  assertMangabaClawStateWriteAllowed,
  isMangabaClawStateWriteContentionError,
  MangabaClawStateOwnershipError,
  runWithMangabaClawStateWriteAccess,
} from "./mangabaclaw-state-ownership.js";
import { getMangabaClawStateRuntimeSchema } from "./mangabaclaw-state-schema-compatibility.js";
import { MANGABACLAW_STATE_SCHEMA_SQL } from "./mangabaclaw-state-schema.js";
export { registerMangabaClawStateDatabaseLifecycleListener } from "./mangabaclaw-state-db-cache.js";

const STATE_MIGRATION_ASSERTIONS = {
  5: assertMangabaClawStateDatabaseV5ForMigration,
  6: assertMangabaClawStateDatabaseV6ForMigration,
  7: assertMangabaClawStateDatabaseV7ForMigration,
  8: assertMangabaClawStateDatabaseV8ForMigration,
} as const;

export {
  MANGABACLAW_DATABASE_SCHEMA_DOCS_URL,
  MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS,
  MANGABACLAW_STATE_SCHEMA_VERSION,
};
export type {
  MangabaClawStateDatabase,
  MangabaClawStateDatabaseOptions,
  MangabaClawStateDatabaseSchemaMigration,
} from "./mangabaclaw-state-db-contract.js";
export {
  assertMangabaClawStateDatabaseForMaintenance,
  createMangabaClawDatabaseVerificationError,
} from "./mangabaclaw-state-db-maintenance.js";
export { ensureMangabaClawStatePermissions } from "./mangabaclaw-state-db-permissions.js";
export { detectMangabaClawStateDatabaseSchemaMigrations } from "./mangabaclaw-state-db-schema-repair.js";
export { withMangabaClawStateStartupMigrationCheckpointDatabase } from "./mangabaclaw-state-db-startup-checkpoint.js";

/** Reconfirm an advisory worker failure on the live owner connection. */
export function confirmMangabaClawStateDatabaseIntegrity(
  pathname: string,
): SqliteIntegrityConfirmation {
  const resolvedPath = path.resolve(pathname);
  closeMangabaClawStateDatabaseByPath(resolvedPath);
  return confirmSqliteFileIntegrity(resolvedPath, resolvedPath);
}

/** Latch background verification damage so later opens fail without rescanning. */
export function recordMangabaClawStateDatabaseOpenFailure(
  pathname: string,
  error: Error,
  generation?: SqliteFileGeneration,
): boolean {
  return stateDbCache.recordMangabaClawStateDatabaseOpenFailure(pathname, error, generation);
}

/** Clear a terminal open failure after doctor rewrites the database file. */
export function clearMangabaClawStateDatabaseOpenFailure(pathname: string): void {
  stateDbCache.clearMangabaClawStateDatabaseOpenFailure(pathname);
}

/** Reject a fresh shared-state open after known corruption until repair clears it. */
export function assertMangabaClawStateDatabaseFreshOpenAllowed(
  options: MangabaClawStateDatabaseOptions = {},
): void {
  const env = options.env ?? process.env;
  stateDbCache.assertMangabaClawStateDatabaseFreshOpenAllowedAtPath(resolveDatabasePath(options), env);
}

type MangabaClawStateMetadataDatabase = Pick<MangabaClawStateKyselyDatabase, "schema_meta">;
const stateDbLog = createSubsystemLogger("state/db");

function executeCanonicalStateSchema(
  database: DatabaseSync,
  options: { includeVersionLazyAdditiveTables: boolean },
): void {
  database.exec(getMangabaClawStateRuntimeSchema(options));
}

function repairMangabaClawStateDatabaseSchemaWithWriteAccess(
  pathname: string,
  env: NodeJS.ProcessEnv,
): {
  changes: string[];
  warnings: string[];
} {
  ensureMangabaClawStatePermissions(pathname, env);
  const db = openNodeSqliteDatabase(pathname);
  const rebuiltIndexNames = new Set<string>();
  let ownershipRefused = false;
  try {
    db.exec(`PRAGMA busy_timeout = ${MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS};`);
    assertSupportedSchemaVersion(db, pathname);
    db.exec("PRAGMA foreign_keys = OFF;");
    const changes = runSqliteImmediateTransactionSync(
      db,
      () => {
        assertMangabaClawStateWriteAllowed({ database: db, databasePath: pathname, env });
        const applied: string[] = [];
        const previousVersion = readSqliteUserVersion(db);
        if (previousVersion === MANGABACLAW_STATE_SCHEMA_VERSION) {
          for (const name of repairCanonicalSqliteIndexes(db, pathname, MANGABACLAW_STATE_SCHEMA_SQL, {
            allowMissingColumns: true,
          })) {
            rebuiltIndexNames.add(name);
          }
          // Current-schema doctor repair may normalize recognized columns or
          // table options, but it must never recreate a missing table empty.
          assertSqliteSchemaTablesPresent(db, pathname, MANGABACLAW_STATE_SCHEMA_SQL, {
            allowedMissingTables: LAZY_ADDITIVE_STATE_TABLES,
          });
        } else if (
          previousVersion === 5 ||
          previousVersion === 6 ||
          previousVersion === 7 ||
          previousVersion === 8
        ) {
          STATE_MIGRATION_ASSERTIONS[previousVersion](db, { pathname });
        }
        if (rebuiltIndexNames.size === 0) {
          assertSqliteIntegrity(db, pathname);
        }
        dropLegacyStateTables(db);
        if (migrateRetiredCommitmentsSchema(db, previousVersion)) {
          applied.push("Retired shared state commitments table and indexes");
        }
        if (migrateWorkerPlacementExecutionModeSchema(db, previousVersion)) {
          applied.push("Migrated cloud worker placements to execution modes");
        }
        applied.push(
          ...describeAgentPathMigration(migrateAgentPaths(db, previousVersion, pathname)),
        );
        if (repairAgentDatabasesCompositePrimaryKey(db)) {
          applied.push(`Migrated shared state agent database registry primary key → agent_id,path`);
        }
        if (repairAuditEventsSchema(db)) {
          applied.push(
            `Migrated shared state audit event ledger → versioned message lifecycle schema`,
          );
        }
        applied.push(...operatorApprovalMigration.repairOperatorApprovalSchema(db));
        const needsSessionWatchMigration =
          sessionWatchMigration.needsSessionWatchCursorProvenanceMigration(db, previousVersion);
        const sessionWatchResult = sessionWatchMigration.migrateSessionWatchCursorProvenance(db);
        if (needsSessionWatchMigration) {
          applied.push(
            `Migrated shared state session watch cursors → provenance column (${sessionWatchResult.migratedAmbientWatches} ambient, ${sessionWatchResult.removedLegacySentinels} sentinels removed)`,
          );
        }
        assertCanonicalStateSchemaShape(db, pathname);
        if (tableExists(db, "audit_events")) {
          ensureAdditiveStateColumns(db);
          executeCanonicalStateSchema(db, {
            includeVersionLazyAdditiveTables: previousVersion !== MANGABACLAW_STATE_SCHEMA_VERSION,
          });
          if (previousVersion < MANGABACLAW_STATE_STRICT_SCHEMA_VERSION) {
            repairLegacyGatewayRestartHandoffsForStrictMigration(db);
            ensureFirstUseAdditiveStateColumnsForStrictMigration(db);
          }
          const strictMigration = migrateSqliteSchemaToStrictInTransaction(
            db,
            getMangabaClawStateRuntimeSchema({
              includeVersionLazyAdditiveTables: previousVersion !== MANGABACLAW_STATE_SCHEMA_VERSION,
            }),
            { databaseLabel: pathname },
          );
          if (strictMigration.migratedTables.length > 0) {
            applied.push(
              `Migrated shared state tables to SQLite STRICT typing (${strictMigration.migratedTables.length})`,
            );
          }
          for (const name of repairCanonicalSqliteIndexes(db, pathname, MANGABACLAW_STATE_SCHEMA_SQL, {
            verifyPhysicalIntegrity: false,
          })) {
            rebuiltIndexNames.add(name);
          }
        }
        markCurrentStateSchemaVersion(db, {
          createMetadataIfMissing: previousVersion < MANGABACLAW_STATE_SCHEMA_VERSION,
        });
        if (readSqliteUserVersion(db) === MANGABACLAW_STATE_SCHEMA_VERSION) {
          assertCurrentStateRuntimeSchema(db, pathname);
        }
        if (rebuiltIndexNames.size > 0) {
          applied.push(`Rebuilt canonical shared-state SQLite indexes (${rebuiltIndexNames.size})`);
        }
        return applied;
      },
      {
        busyTimeoutMs: MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS,
        databaseLabel: pathname,
        operationLabel: "state.schema.repair",
      },
    );
    const quarantineCleared = clearMangabaClawDatabaseQuarantine(pathname, { env });
    clearMangabaClawStateDatabaseOpenFailure(pathname);
    return {
      changes,
      warnings: quarantineCleared
        ? []
        : [
            `Persisted quarantine record for ${pathname} could not be cleared; rerun mangabaclaw doctor --fix so the repaired database is not refused again.`,
          ],
    };
  } catch (err) {
    if (err instanceof MangabaClawStateOwnershipError) {
      ownershipRefused = true;
      throw err;
    }
    // Reaching this catch inside doctor means repair itself refused or failed,
    // so the runtime asserts' "run mangabaclaw doctor --fix" advice is circular here.
    const reason = String(err).replace(
      /has a legacy ([a-z ]+) schema; run mangabaclaw doctor --fix to migrate it\./u,
      "has a legacy $1 schema; automatic repair refused the unrecognized schema shape.",
    );
    return {
      changes: [],
      warnings: [`Failed migrating shared state database schema at ${pathname}: ${reason}`],
    };
  } finally {
    if (db.isOpen) {
      db.exec("PRAGMA foreign_keys = ON;");
    }
    clearNodeSqliteKyselyCacheForDatabase(db);
    db.close();
    if (!ownershipRefused) {
      ensureMangabaClawStatePermissions(pathname, env);
    }
  }
}

export function repairMangabaClawStateDatabaseSchema(options: MangabaClawStateDatabaseOptions = {}): {
  changes: string[];
  warnings: string[];
} {
  const env = options.env ?? process.env;
  const pathname = resolveDatabasePath(options);
  if (!existsSync(pathname)) {
    return { changes: [], warnings: [] };
  }
  return runWithMangabaClawStateWriteAccess(
    { databasePath: pathname, env },
    "state schema repair",
    () => repairMangabaClawStateDatabaseSchemaWithWriteAccess(pathname, env),
  );
}

function needsMangabaClawStateDatabaseSchemaRepair(pathname: string): boolean {
  let database: DatabaseSync | undefined;
  try {
    database = openNodeSqliteDatabase(pathname, { readOnly: true });
    assertSupportedSchemaVersion(database, pathname);
    const needsRepair =
      readSqliteUserVersion(database) !== MANGABACLAW_STATE_SCHEMA_VERSION ||
      detectMangabaClawStateDatabaseSchemaMigrationsFromDatabase(database, pathname).length > 0;
    if (!needsRepair) {
      assertCurrentStateRuntimeSchema(database, pathname);
    }
    return needsRepair;
  } catch {
    // Preserve the repair path's existing diagnostics for unreadable or noncanonical databases.
    return true;
  } finally {
    database?.close();
  }
}

/** Skip the exclusive doctor repair when automatic migration sees a canonical current schema. */
export function repairMangabaClawStateDatabaseSchemaIfNeeded(
  options: MangabaClawStateDatabaseOptions = {},
): {
  changes: string[];
  warnings: string[];
} {
  const env = options.env ?? process.env;
  const pathname = resolveDatabasePath(options);
  if (!existsSync(pathname)) {
    return { changes: [], warnings: [] };
  }

  return runWithMangabaClawStateWriteAccess(
    { databasePath: pathname, env },
    "state schema repair preflight/repair",
    () =>
      needsMangabaClawStateDatabaseSchemaRepair(pathname)
        ? repairMangabaClawStateDatabaseSchemaWithWriteAccess(pathname, env)
        : { changes: [], warnings: [] },
  );
}

function ensureSchema(
  db: DatabaseSync,
  pathname: string,
  env: NodeJS.ProcessEnv,
  busyTimeoutMs = MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS,
): void {
  const now = Date.now();
  const kysely = getNodeSqliteKysely<MangabaClawStateMetadataDatabase>(db);
  // Rebuilding referenced tables requires disabling FK enforcement before BEGIN.
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    runSqliteImmediateTransactionSync(
      db,
      () => {
        // Recheck ownership after BEGIN IMMEDIATE so no current-schema repair
        // can race a durable external ownership claim.
        assertMangabaClawStateWriteAllowed({ database: db, databasePath: pathname, env });
        assertSupportedSchemaVersion(db, pathname);
        const previousVersion = readSqliteUserVersion(db);
        if (previousVersion === MANGABACLAW_STATE_SCHEMA_VERSION) {
          verifyAndRepairCanonicalSqliteIndexes(db, pathname, MANGABACLAW_STATE_SCHEMA_SQL, {
            allowMissingColumns: true,
            validateAfterRepair: () => assertCurrentStateRuntimeSchema(db, pathname),
          });
          ensureAdditiveStateColumns(db);
          assertCurrentStateRuntimeSchema(db, pathname);
        } else if (
          previousVersion === 5 ||
          previousVersion === 6 ||
          previousVersion === 7 ||
          previousVersion === 8
        ) {
          STATE_MIGRATION_ASSERTIONS[previousVersion](db, { pathname });
        }
        dropLegacyStateTables(db);
        migrateRetiredCommitmentsSchema(db, previousVersion);
        migrateWorkerPlacementExecutionModeSchema(db, previousVersion);
        const pathMigration: AgentPathSummary = migrateAgentPaths(db, previousVersion, pathname);
        ensureAdditiveStateColumns(db);
        sessionWatchMigration.migrateSessionWatchCursorProvenance(db);
        assertCanonicalStateSchemaShape(db, pathname);
        executeCanonicalStateSchema(db, {
          includeVersionLazyAdditiveTables: previousVersion !== MANGABACLAW_STATE_SCHEMA_VERSION,
        });
        migrateLegacyCronRunLogsToTaskRuns(db);
        if (previousVersion < MANGABACLAW_STATE_STRICT_SCHEMA_VERSION) {
          repairLegacyGatewayRestartHandoffsForStrictMigration(db);
          ensureFirstUseAdditiveStateColumnsForStrictMigration(db);
          migrateSqliteSchemaToStrictInTransaction(
            db,
            getMangabaClawStateRuntimeSchema({
              includeVersionLazyAdditiveTables: previousVersion !== MANGABACLAW_STATE_SCHEMA_VERSION,
            }),
            { databaseLabel: pathname },
          );
        }
        repairCanonicalSqliteIndexes(db, pathname, MANGABACLAW_STATE_SCHEMA_SQL, {
          verifyPhysicalIntegrity: false,
        });
        db.exec(`PRAGMA user_version = ${MANGABACLAW_STATE_SCHEMA_VERSION};`);
        executeSqliteQuerySync(
          db,
          kysely
            .insertInto("schema_meta")
            .values({
              meta_key: "primary",
              role: "global",
              schema_version: MANGABACLAW_STATE_SCHEMA_VERSION,
              agent_id: null,
              app_version: VERSION,
              created_at: now,
              updated_at: now,
            })
            .onConflict((conflict) =>
              conflict
                .column("meta_key")
                .doUpdateSet({
                  role: "global",
                  schema_version: MANGABACLAW_STATE_SCHEMA_VERSION,
                  agent_id: null,
                  app_version: VERSION,
                  updated_at: now,
                })
                // updated_at records when schema metadata last changed, not when
                // the database was last opened; unconditional bumps make every
                // open dirty the row and defeat no-change backup detection.
                .where((eb) =>
                  eb.or([
                    eb("schema_meta.schema_version", "!=", MANGABACLAW_STATE_SCHEMA_VERSION),
                    eb("schema_meta.app_version", "!=", VERSION),
                    eb("schema_meta.role", "!=", "global"),
                  ]),
                ),
            ),
        );
        assertMangabaClawStateDatabaseForMaintenance(db, { pathname });
        warnAgentPathMigration(stateDbLog, pathMigration, pathname);
      },
      {
        busyTimeoutMs,
        databaseLabel: pathname,
        operationLabel: "state.schema.ensure",
      },
    );
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

/** Open existing shared state without creating, migrating, chmodding, or configuring it. */
export async function openExistingMangabaClawStateDatabaseReadOnly(
  options: MangabaClawStateDatabaseOptions = {},
): Promise<MangabaClawStateDatabase | undefined> {
  const pathname = resolveDatabasePath(options);
  if (!existsSync(pathname)) {
    return undefined;
  }
  assertMangabaClawStateDatabaseFreshOpenAllowed(options);
  const prepared = await prepareSqliteReadOnlyLocation(pathname);
  let db: DatabaseSync;
  try {
    db = openNodeSqliteDatabase(prepared.location, {
      readOnly: true,
    });
  } catch (error) {
    prepared.cleanup();
    throw error;
  }
  try {
    db.exec(`PRAGMA busy_timeout = ${MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS};`);
    assertSupportedSchemaVersion(db, pathname);
    assertSqliteIntegrity(db, pathname);
    if (readSqliteUserVersion(db) === MANGABACLAW_STATE_SCHEMA_VERSION) {
      assertMangabaClawStateDatabaseForMaintenance(db, { pathname });
    }
  } catch (error) {
    try {
      clearNodeSqliteKyselyCacheForDatabase(db);
      db.close();
    } catch {
      // Preserve the verification failure that explains why the database was refused.
    }
    prepared.cleanup();
    throw error;
  }
  let cleanupComplete = false;
  return {
    db,
    path: pathname,
    walMaintenance: {
      checkpoint: () => false,
      // Cleanup can fail transiently after the database closes. Keep the
      // close contract retryable until one call finishes both responsibilities.
      close: () => {
        const wasOpen = db.isOpen;
        if (!wasOpen && cleanupComplete) {
          return false;
        }
        try {
          if (wasOpen) {
            clearNodeSqliteKyselyCacheForDatabase(db);
            db.close();
          }
        } finally {
          cleanupComplete = prepared.cleanup();
        }
        return cleanupComplete;
      },
    },
  };
}

function assertCurrentStateRuntimeSchema(database: DatabaseSync, pathname: string): void {
  assertCanonicalStateSchemaShape(database, pathname);
  assertMangabaClawStateDatabaseForMaintenance(database, { pathname });
}

/** Open or return a cached shared state database after schema and migration checks. */

function openMangabaClawStateDatabaseWithBusyTimeout(
  options: MangabaClawStateDatabaseOptions = {},
  busyTimeoutMs = MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS,
  lockFailureReporting: SqliteLockFailureReporting = "report",
): MangabaClawStateDatabase {
  const env = options.env ?? process.env;
  if (options.database) {
    assertMangabaClawStateWriteAllowed({
      database: options.database.db,
      databasePath: options.database.path,
      env,
    });
    return options.database;
  }
  const pathname = resolveDatabasePath(options);
  // Latched paths are quarantined: the recorder closed any live handle, and
  // every open fails fast here until doctor repairs the file and clears it.
  try {
    stateDbCache.assertMangabaClawStateDatabaseOpenAllowed(pathname);
  } catch (error) {
    stateDbCache.recordMangabaClawStateDatabaseLifecycleOpenError(pathname, error);
    throw error;
  }
  const cached = stateDbCache.getCachedMangabaClawStateDatabase(pathname);
  if (cached?.db.isOpen) {
    assertMangabaClawStateWriteAllowed({ database: cached.db, databasePath: pathname, env });
    return cached;
  }
  try {
    assertMangabaClawStateDatabaseFreshOpenAllowed(options);
  } catch (error) {
    stateDbCache.recordMangabaClawStateDatabaseLifecycleOpenError(pathname, error);
    throw error;
  }
  let unpublished: MangabaClawStateDatabase | undefined;
  try {
    unpublished = runWithMangabaClawStateWriteAccess(
      { databasePath: pathname, busyTimeoutMs, env },
      "fresh state database open",
      () => {
        if (cached) {
          // A closed handle can leave Kysely and WAL helpers cached; clear both under access.
          stateDbCache.closeStaleCachedMangabaClawStateDatabase(cached);
        }
        return (unpublished = openUnpublishedStateDatabase({
          pathname,
          env,
          busyTimeoutMs,
          lockFailureReporting,
          ensureSchema: (database) => ensureSchema(database, pathname, env, busyTimeoutMs),
          recordOpenFailure: recordMangabaClawStateDatabaseOpenFailure,
        }));
      },
    );
  } catch (error) {
    if (lockFailureReporting === "report" || !isMangabaClawStateWriteContentionError(error)) {
      stateDbCache.recordMangabaClawStateDatabaseLifecycleOpenError(pathname, error);
    }
    if (!unpublished) {
      throw error;
    }
    const cleanup = stateDbCache.closeMangabaClawStateDatabaseHandle(unpublished);
    if (cleanup.caught) {
      throw createSqliteLifecycleAggregateError(
        [error, ...cleanup.errors],
        `Fresh MangabaClaw state database open failed releasing access and closing its unpublished handle for ${pathname}.`,
        error,
      );
    }
    throw error;
  }
  return stateDbCache.publishMangabaClawStateDatabase(unpublished);
}

/** Open or return a cached shared state database after schema and migration checks. */
export function openMangabaClawStateDatabase(
  options: MangabaClawStateDatabaseOptions = {},
): MangabaClawStateDatabase {
  return openMangabaClawStateDatabaseWithBusyTimeout(options);
}

/** Run one operation through the shared owner without waiting synchronously on SQLite locks. */
export function runWithMangabaClawStateBusyTimeout<T>(
  operation: (database: MangabaClawStateDatabase) => T,
  options: MangabaClawStateDatabaseOptions,
  busyTimeoutMs: number,
): T {
  const normalizedTimeoutMs = normalizeSqliteNonNegativeInteger(busyTimeoutMs, "busyTimeoutMs");
  const existing = options.database ?? getMangabaClawStateDatabaseIfOpen(options);
  if (existing) {
    return runWithSqliteBusyTimeout(existing.db, normalizedTimeoutMs, () => operation(existing), {
      lockFailureReporting: "suppress",
    });
  }
  const opened = openMangabaClawStateDatabaseWithBusyTimeout(options, normalizedTimeoutMs, "suppress");
  try {
    return runWithSqliteBusyTimeout(opened.db, normalizedTimeoutMs, () => operation(opened), {
      lockFailureReporting: "suppress",
    });
  } finally {
    if (opened.db.isOpen) {
      setSqliteBusyTimeout(opened.db, MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS);
    }
  }
}

/** Run a synchronous immediate transaction against the shared state database. */
export function runMangabaClawStateWriteTransaction<T>(
  operation: (database: MangabaClawStateDatabase) => T,
  options: MangabaClawStateDatabaseOptions = {},
  transactionOptions: Pick<
    SqliteTransactionOptions,
    "busyTimeoutMs" | "operationLabel" | "slowTransactionHoldMs"
  > = {},
): T {
  const cachedBeforeOpen = options.database ?? getMangabaClawStateDatabaseIfOpen(options);
  let database: MangabaClawStateDatabase;
  try {
    database = openMangabaClawStateDatabase(options);
  } catch (error) {
    if (cachedBeforeOpen && isSqliteCorruptionError(error)) {
      stateDbCache.evictCachedMangabaClawStateDatabase(cachedBeforeOpen);
    }
    throw error;
  }
  let result: T;
  try {
    result = runSqliteImmediateTransactionSync(
      database.db,
      () => {
        assertMangabaClawStateWriteAllowed({
          database: database.db,
          databasePath: database.path,
          env: options.env ?? process.env,
        });
        return operation(database);
      },
      {
        busyTimeoutMs: transactionOptions.busyTimeoutMs ?? readSqliteBusyTimeout(database.db),
        databaseLabel: database.path,
        ...transactionOptions,
        operationLabel: transactionOptions.operationLabel ?? "state.write",
      },
    );
  } catch (error) {
    if (isSqliteCorruptionError(error)) {
      stateDbCache.evictCachedMangabaClawStateDatabase(database);
    }
    throw error;
  }
  try {
    ensureMangabaClawStatePermissions(database.path, options.env ?? process.env);
  } catch {
    // The write already committed; permission hardening is best-effort here so
    // callers never retry an operation that is durable in SQLite.
  }
  return result;
}

/**
 * Return a shared state handle this process already holds open, if any.
 *
 * Read-only callers use this to avoid opening a connection per call; it never
 * creates, repairs, or registers a handle.
 */
export function getMangabaClawStateDatabaseIfOpen(
  options: MangabaClawStateDatabaseOptions = {},
): MangabaClawStateDatabase | undefined {
  return stateDbCache.getMangabaClawStateDatabaseIfOpenAtPath(resolveDatabasePath(options));
}

/** Evict an exact cached shared-state owner after a proven corruption read. */
export function evictMangabaClawStateDatabaseAfterCorruption(
  database: MangabaClawStateDatabase,
  error: unknown,
): boolean {
  return stateDbCache.evictMangabaClawStateDatabaseAfterCorruption(database, error);
}

/** Close one cached shared state database handle by exact pathname. */
export function closeMangabaClawStateDatabaseByPath(pathname: string): boolean {
  return stateDbCache.closeMangabaClawStateDatabaseByPath(pathname);
}

/** Close all cached shared state database handles. */
export function closeMangabaClawStateDatabase(
  options?: Parameters<typeof stateDbCache.closeMangabaClawStateDatabase>[0],
): void {
  stateDbCache.closeMangabaClawStateDatabase(options);
}

/** Test whether any cached shared state database handle is still open. */
export function isMangabaClawStateDatabaseOpen(): boolean {
  return stateDbCache.isMangabaClawStateDatabaseOpen();
}

/** Close shared state handles and clear terminal failure latches for test isolation. */
export function closeMangabaClawStateDatabaseForTest(): void {
  stateDbCache.closeMangabaClawStateDatabaseForTest();
}
