import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { formatErrorMessage } from "../infra/errors.js";
import {
  clearNodeSqliteKyselyCacheForDatabase,
  executeSqliteQuerySync,
  getNodeSqliteKysely,
} from "../infra/kysely-sync.js";
import { openNodeSqliteDatabase, resolveImmutableSqliteFileUri } from "../infra/node-sqlite.js";
import { assertSqliteIntegrity } from "../infra/sqlite-integrity.js";
import {
  collectSqliteSchemaIssues,
  type SqliteSchemaIssue,
} from "../infra/sqlite-schema-contract.js";
import {
  describeRunningMangabaClawBuild,
  readSqliteUserVersion,
} from "../infra/sqlite-user-version.js";
import { MANGABACLAW_AGENT_SCHEMA_VERSION } from "./mangabaclaw-agent-db-contract.js";
import { assertMangabaClawAgentDatabaseForMaintenance } from "./mangabaclaw-agent-db-maintenance.js";
import type { MangabaClawSchemaVersions } from "./mangabaclaw-schema-versions.js";
import {
  MANGABACLAW_DATABASE_SCHEMA_DOCS_URL,
  MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS,
  MANGABACLAW_STATE_SCHEMA_VERSION,
} from "./mangabaclaw-state-db-contract.js";
import {
  assertMangabaClawStateDatabaseOwner,
  assertMangabaClawStateDatabaseForMaintenance,
} from "./mangabaclaw-state-db-maintenance.js";
import type { DB as MangabaClawStateKyselyDatabase } from "./mangabaclaw-state-db.generated.js";
import {
  resolveMangabaClawRegisteredAgentDatabasePath,
  resolveMangabaClawStateSqlitePath,
} from "./mangabaclaw-state-db.paths.js";
import {
  inspectMangabaClawStateOwnershipFromDatabase,
  type MangabaClawExternalStateOwnership,
} from "./mangabaclaw-state-ownership.js";
import {
  getMangabaClawStateRuntimeSchema,
  isMangabaClawStateFirstUseSchemaIssue,
  isMangabaClawStateStartupRepairableSchemaIssue,
  MANGABACLAW_STATE_MAINTENANCE_SCHEMA_COMPATIBILITY,
  STATE_PERSISTENT_SCHEMA_COMPATIBILITY,
} from "./mangabaclaw-state-schema-compatibility.js";
import { MANGABACLAW_STATE_SCHEMA_SQL } from "./mangabaclaw-state-schema.js";

export { MANGABACLAW_DATABASE_SCHEMA_DOCS_URL } from "./mangabaclaw-state-db.js";

export type IncompatibleMangabaClawDatabase = {
  kind: "agent" | "state";
  path: string;
  agentId?: string;
  foundVersion: number;
  supportedVersion: number;
  writerAppVersion?: string;
};

export type IndeterminateMangabaClawDatabase = {
  kind: "agent" | "state";
  path: string;
  reason: string;
};

export type MangabaClawDatabaseSchemaPreflight = {
  incompatible: IncompatibleMangabaClawDatabase[];
  indeterminate: IndeterminateMangabaClawDatabase[];
};

type MangabaClawStateSchemaPreflightResult = {
  databasePath: string;
  foundVersion: number | null;
  issues: SqliteSchemaIssue[];
  ownership: MangabaClawExternalStateOwnership | null;
  reason?: string;
  requiresWrite: boolean;
  schema: "mangabaclaw.state-schema-preflight.v1";
  status: "exact" | "startup-repairable" | "migration-required" | "incompatible" | "indeterminate";
  targetVersion: number;
};

type AgentRegistryDatabase = Pick<MangabaClawStateKyselyDatabase, "agent_databases">;

type MangabaClawDatabaseSchemaPreflightOperation = "doctor" | "gateway-restart" | "gateway-startup";

function formatDoctorIncompatibleDatabase(database: IncompatibleMangabaClawDatabase): string {
  const agent = database.agentId ? ` for agent ${database.agentId}` : "";
  const writer = database.writerAppVersion ? `; writer build ${database.writerAppVersion}` : "";
  return `${database.kind} database${agent} ${database.path} uses schema ${database.foundVersion}; this build supports ${database.supportedVersion}${writer}.`;
}

/** Fatal refusal when persisted schemas were written by a newer build. */
export class MangabaClawDatabaseSchemaPreflightError extends Error {
  constructor(
    readonly incompatibleDatabases: readonly IncompatibleMangabaClawDatabase[],
    options: { operation?: MangabaClawDatabaseSchemaPreflightOperation } = {},
  ) {
    const operation = options.operation ?? "gateway-startup";
    const prefix =
      operation === "doctor"
        ? "Doctor refused to continue"
        : operation === "gateway-restart"
          ? "Gateway refused restart"
          : "Gateway refused startup";
    const doctorGuidance =
      operation === "doctor"
        ? ` ${incompatibleDatabases.map(formatDoctorIncompatibleDatabase).join(" ")} Run Doctor with the MangabaClaw install that wrote this state (typically the active Gateway install), or another build that supports these schemas.`
        : "";
    super(
      `${prefix} because ${incompatibleDatabases.length} MangabaClaw database schema(s) are newer than this build. ` +
        `Refused by ${describeRunningMangabaClawBuild()}.${doctorGuidance} See ${MANGABACLAW_DATABASE_SCHEMA_DOCS_URL}.`,
    );
    this.name = "MangabaClawDatabaseSchemaPreflightError";
  }
}

/** Refuse a restart that would reopen the current persisted databases unsuccessfully. */
export function assertMangabaClawDatabasesReadyForRestart(options: { env: NodeJS.ProcessEnv }): void {
  const schemas = preflightMangabaClawDatabaseSchemas({
    env: options.env,
    supportedVersions: {
      state: MANGABACLAW_STATE_SCHEMA_VERSION,
      agent: MANGABACLAW_AGENT_SCHEMA_VERSION,
    },
    verifyCurrentSchemaShape: true,
  });
  if (schemas.incompatible.length > 0) {
    throw new MangabaClawDatabaseSchemaPreflightError(schemas.incompatible, {
      operation: "gateway-restart",
    });
  }
  if (schemas.indeterminate.length === 0) {
    return;
  }
  const shown = schemas.indeterminate
    .slice(0, 3)
    .map((database) => `${database.kind} ${database.path}: ${database.reason}`);
  const omitted = schemas.indeterminate.length - shown.length;
  throw new Error(
    `Gateway refused restart because persisted database readiness could not be verified: ${shown.join("; ")}${omitted > 0 ? `; +${omitted} more` : ""}. Run mangabaclaw doctor --fix, then retry the restart.`,
  );
}

function readWriterAppVersion(database: DatabaseSync): string | undefined {
  try {
    const row = database
      .prepare("SELECT app_version FROM schema_meta WHERE meta_key = 'primary' LIMIT 1")
      .get() as { app_version?: unknown } | undefined;
    return typeof row?.app_version === "string" && row.app_version.length > 0
      ? row.app_version
      : undefined;
  } catch {
    return undefined;
  }
}

function readRegisteredAgentDatabases(
  database: DatabaseSync,
  registryPath: string,
): Array<{
  agentId: string;
  path: string;
}> {
  const table = database
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'agent_databases'")
    .get();
  if (!table) {
    return [];
  }
  const db = getNodeSqliteKysely<AgentRegistryDatabase>(database);
  return executeSqliteQuerySync(
    database,
    db.selectFrom("agent_databases").select(["agent_id", "path"]),
  ).rows.flatMap((row) =>
    typeof row.agent_id === "string" && typeof row.path === "string"
      ? [
          {
            agentId: row.agent_id,
            path: resolveMangabaClawRegisteredAgentDatabasePath(registryPath, row.path),
          },
        ]
      : [],
  );
}

function deduplicateSchemaIssues(issues: readonly SqliteSchemaIssue[]): SqliteSchemaIssue[] {
  return [
    ...new Map(
      issues.map((issue) => [`${issue.code}\0${issue.objectName}`, issue] as const),
    ).values(),
  ];
}

/** Compare one explicit SQLite file with this release's canonical shared-state schema. */
export async function preflightMangabaClawStateDatabasePath(
  databasePath: string,
): Promise<MangabaClawStateSchemaPreflightResult> {
  const resolvedPath = path.resolve(databasePath);
  const base = {
    schema: "mangabaclaw.state-schema-preflight.v1",
    databasePath: resolvedPath,
    targetVersion: MANGABACLAW_STATE_SCHEMA_VERSION,
  } as const;
  let database: DatabaseSync | undefined;
  let foundVersion: number | null = null;
  let ownership: MangabaClawExternalStateOwnership | null = null;
  const result = (
    status: MangabaClawStateSchemaPreflightResult["status"],
    details: { issues?: SqliteSchemaIssue[]; reason?: string; requiresWrite?: boolean } = {},
  ): MangabaClawStateSchemaPreflightResult => ({
    ...base,
    foundVersion,
    ownership,
    issues: details.issues ?? [],
    status,
    requiresWrite: details.requiresWrite ?? false,
    ...(details.reason ? { reason: details.reason } : {}),
  });
  try {
    const inspectionPath = realpathSync.native(resolvedPath);
    const sidecars = ["-wal", "-shm", "-journal"].filter((suffix) =>
      existsSync(`${inspectionPath}${suffix}`),
    );
    if (sidecars.length > 0) {
      throw new Error(
        `SQLite preflight requires a consolidated snapshot with no sidecars; found ${sidecars.join(", ")}. Create a WAL-aware online backup and preflight the resulting standalone file.`,
      );
    }
    database = openNodeSqliteDatabase(resolveImmutableSqliteFileUri(inspectionPath), {
      readOnly: true,
    });
    database.exec(
      `PRAGMA busy_timeout = ${MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS}; PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;`,
    );
    assertSqliteIntegrity(database, resolvedPath);
    foundVersion = readSqliteUserVersion(database);
    if (!Number.isSafeInteger(foundVersion) || foundVersion < 0) {
      throw new Error(
        `MangabaClaw state database ${resolvedPath} has invalid schema version metadata.`,
      );
    }
    if (foundVersion > MANGABACLAW_STATE_SCHEMA_VERSION) {
      try {
        ownership = inspectMangabaClawStateOwnershipFromDatabase(database, resolvedPath);
      } catch {
        // A newer release can own a newer metadata contract; the numeric refusal remains decisive.
      }
      return result("incompatible");
    }
    ownership = inspectMangabaClawStateOwnershipFromDatabase(database, resolvedPath);
    if (foundVersion < MANGABACLAW_STATE_SCHEMA_VERSION) {
      return result("migration-required", { requiresWrite: true });
    }
    assertMangabaClawStateDatabaseOwner(database, { pathname: resolvedPath });
    const metadata = database
      .prepare("SELECT schema_version FROM schema_meta WHERE meta_key = 'primary' LIMIT 1")
      .get() as { schema_version?: unknown } | undefined;
    if (metadata?.schema_version !== foundVersion) {
      throw new Error(
        `MangabaClaw state database ${resolvedPath} metadata schema version ${typeof metadata?.schema_version === "number" ? metadata.schema_version : "invalid"} does not match ${foundVersion}.`,
      );
    }
    const maintenanceIssues = collectSqliteSchemaIssues(
      database,
      MANGABACLAW_STATE_SCHEMA_SQL,
      MANGABACLAW_STATE_MAINTENANCE_SCHEMA_COMPATIBILITY,
    );
    const blockingIssues = maintenanceIssues.filter(
      (issue) =>
        !isMangabaClawStateStartupRepairableSchemaIssue(issue) &&
        !isMangabaClawStateFirstUseSchemaIssue(issue),
    );
    if (blockingIssues.length > 0) {
      return result("incompatible", { issues: deduplicateSchemaIssues(blockingIssues) });
    }
    const projectedRuntimeIssues = collectSqliteSchemaIssues(
      database,
      getMangabaClawStateRuntimeSchema({ includeVersionLazyAdditiveTables: false }),
      STATE_PERSISTENT_SCHEMA_COMPATIBILITY,
    );
    const projectedRuntimeBlockingIssues = projectedRuntimeIssues.filter(
      (issue) =>
        !isMangabaClawStateStartupRepairableSchemaIssue(issue) &&
        !isMangabaClawStateFirstUseSchemaIssue(issue),
    );
    if (projectedRuntimeBlockingIssues.length > 0) {
      return result("incompatible", {
        issues: deduplicateSchemaIssues(projectedRuntimeBlockingIssues),
      });
    }
    const startupRepairableIssues = deduplicateSchemaIssues([
      ...maintenanceIssues.filter(isMangabaClawStateStartupRepairableSchemaIssue),
      ...projectedRuntimeIssues.filter(isMangabaClawStateStartupRepairableSchemaIssue),
    ]);
    return result(startupRepairableIssues.length > 0 ? "startup-repairable" : "exact", {
      issues: startupRepairableIssues,
      requiresWrite: startupRepairableIssues.length > 0,
    });
  } catch (error) {
    return result("indeterminate", { reason: formatErrorMessage(error) });
  } finally {
    database?.close();
  }
}

/** Read schema headers and optionally verify current schema shape without repairing it. */
export function preflightMangabaClawDatabaseSchemas(options: {
  env: NodeJS.ProcessEnv;
  supportedVersions: MangabaClawSchemaVersions;
  verifyCurrentSchemaShape?: boolean;
}): MangabaClawDatabaseSchemaPreflight {
  const result: MangabaClawDatabaseSchemaPreflight = { incompatible: [], indeterminate: [] };
  const statePath = path.resolve(resolveMangabaClawStateSqlitePath(options.env));
  if (!existsSync(statePath)) {
    return result;
  }

  let stateDatabase: DatabaseSync | undefined;
  try {
    stateDatabase = openNodeSqliteDatabase(statePath, {
      readOnly: true,
    });
    stateDatabase.exec(`PRAGMA busy_timeout = ${MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS};`);
    const stateVersion = readSqliteUserVersion(stateDatabase);
    if (stateVersion > options.supportedVersions.state) {
      const writerAppVersion = readWriterAppVersion(stateDatabase);
      result.incompatible.push({
        kind: "state",
        path: statePath,
        foundVersion: stateVersion,
        supportedVersion: options.supportedVersions.state,
        ...(writerAppVersion ? { writerAppVersion } : {}),
      });
    }
    if (
      options.verifyCurrentSchemaShape === true &&
      stateVersion === MANGABACLAW_STATE_SCHEMA_VERSION
    ) {
      try {
        assertMangabaClawStateDatabaseForMaintenance(stateDatabase, { pathname: statePath });
      } catch (error) {
        result.indeterminate.push({
          kind: "state",
          path: statePath,
          reason: formatErrorMessage(error),
        });
      }
    }

    let registeredDatabases: ReturnType<typeof readRegisteredAgentDatabases>;
    try {
      registeredDatabases = readRegisteredAgentDatabases(stateDatabase, statePath);
    } catch (error) {
      result.indeterminate.push({
        kind: "state",
        path: statePath,
        reason: `agent database registry query failed: ${formatErrorMessage(error)}`,
      });
      return result;
    }

    for (const row of registeredDatabases) {
      const agentPath = path.resolve(row.path);
      if (!existsSync(agentPath)) {
        continue;
      }
      let agentDatabase: DatabaseSync | undefined;
      try {
        agentDatabase = openNodeSqliteDatabase(agentPath, {
          readOnly: true,
        });
        agentDatabase.exec(`PRAGMA busy_timeout = ${MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS};`);
        const agentVersion = readSqliteUserVersion(agentDatabase);
        if (agentVersion <= options.supportedVersions.agent) {
          if (options.verifyCurrentSchemaShape === true) {
            // Existing agent databases require Doctor-owned migration before
            // startup; a successor cannot safely repair them after close.
            assertMangabaClawAgentDatabaseForMaintenance(agentDatabase, {
              agentId: row.agentId,
              pathname: agentPath,
            });
          }
          continue;
        }
        const writerAppVersion = readWriterAppVersion(agentDatabase);
        result.incompatible.push({
          kind: "agent",
          path: agentPath,
          agentId: row.agentId,
          foundVersion: agentVersion,
          supportedVersion: options.supportedVersions.agent,
          ...(writerAppVersion ? { writerAppVersion } : {}),
        });
      } catch (error) {
        result.indeterminate.push({
          kind: "agent",
          path: agentPath,
          reason: formatErrorMessage(error),
        });
      } finally {
        agentDatabase?.close();
      }
    }
    return result;
  } catch (error) {
    result.indeterminate.push({
      kind: "state",
      path: statePath,
      reason: formatErrorMessage(error),
    });
    return result;
  } finally {
    if (stateDatabase) {
      clearNodeSqliteKyselyCacheForDatabase(stateDatabase);
      stateDatabase.close();
    }
  }
}
