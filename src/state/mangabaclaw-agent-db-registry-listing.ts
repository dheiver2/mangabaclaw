import { lstatSync, statSync } from "node:fs";
import path from "node:path";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../infra/kysely-sync.js";
import { resolveSqliteDatabaseFilePaths } from "../infra/sqlite-files.js";
import { normalizeAgentId } from "../routing/session-key.js";
import {
  MANGABACLAW_AGENT_SCHEMA_VERSION,
  type MangabaClawRegisteredAgentDatabase,
} from "./mangabaclaw-agent-db-contract.js";
import { withExistingMangabaClawStateDatabaseReadOnly } from "./mangabaclaw-state-db-readonly.js";
import { detectMangabaClawStateDatabaseSchemaMigrationsFromDatabase } from "./mangabaclaw-state-db-schema-repair.js";
import type { DB as MangabaClawStateKyselyDatabase } from "./mangabaclaw-state-db.generated.js";
import type { MangabaClawStateDatabaseOptions } from "./mangabaclaw-state-db.js";
import {
  resolveMangabaClawRegisteredAgentDatabasePath,
  resolveMangabaClawStateSqlitePath,
} from "./mangabaclaw-state-db.paths.js";

type MangabaClawAgentRegistryDatabase = Pick<MangabaClawStateKyselyDatabase, "agent_databases">;

// Registry metadata is process-stable: registry writes invalidate after each commit;
// other-process changes take effect on restart. Polling here puts schema probes back on hot reads.
let registeredAgentDatabasesMemo:
  | {
      pathname: string;
      token: symbol;
      entries?: readonly MangabaClawRegisteredAgentDatabase[];
    }
  | undefined;

function resolveAgentDatabaseRegistryPath(options: MangabaClawStateDatabaseOptions): string {
  return path.resolve(options.path ?? resolveMangabaClawStateSqlitePath(options.env ?? process.env));
}

function activateRegisteredAgentDatabasesMemo(
  options: MangabaClawStateDatabaseOptions,
): NonNullable<typeof registeredAgentDatabasesMemo> {
  const pathname = resolveAgentDatabaseRegistryPath(options);
  if (registeredAgentDatabasesMemo?.pathname !== pathname) {
    // One active pathname keeps registry metadata process-stable without retaining
    // an unbounded generation map. Switching back creates a fresh generation.
    registeredAgentDatabasesMemo = { pathname, token: Symbol(pathname) };
  }
  return registeredAgentDatabasesMemo;
}

/** Return the process-stable generation for the active agent database registry. */
export function readMangabaClawAgentDatabaseRegistryToken(
  options: MangabaClawStateDatabaseOptions = {},
): symbol {
  return activateRegisteredAgentDatabasesMemo(options).token;
}

export function invalidateRegisteredAgentDatabasesMemo(
  options: MangabaClawStateDatabaseOptions,
): void {
  const pathname = resolveAgentDatabaseRegistryPath(options);
  if (registeredAgentDatabasesMemo?.pathname === pathname) {
    registeredAgentDatabasesMemo = { pathname, token: Symbol(pathname) };
  }
}

function cloneRegisteredAgentDatabases(
  entries: readonly MangabaClawRegisteredAgentDatabase[],
): MangabaClawRegisteredAgentDatabase[] {
  return entries.map((entry) => ({ ...entry }));
}

function hasUnavailableMissingSqlitePath(pathname: string): boolean {
  for (const candidate of resolveSqliteDatabaseFilePaths(pathname)) {
    try {
      lstatSync(candidate);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return true;
      }
    }
  }

  let ancestor = path.dirname(pathname);
  while (true) {
    try {
      const stat = lstatSync(ancestor);
      if (!stat.isSymbolicLink()) {
        return !stat.isDirectory();
      }
      try {
        return !statSync(ancestor).isDirectory();
      } catch {
        return true;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return true;
      }
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) {
      return false;
    }
    ancestor = parent;
  }
}

/** List agent databases recorded in the shared MangabaClaw state registry. */
export function listMangabaClawRegisteredAgentDatabases(
  options: MangabaClawStateDatabaseOptions & {
    includeIncompatibleSchemaVersions?: boolean;
  } = {},
): MangabaClawRegisteredAgentDatabase[] {
  const memo = activateRegisteredAgentDatabasesMemo(options);
  const { pathname } = memo;
  if (memo.entries) {
    const entries = cloneRegisteredAgentDatabases(memo.entries);
    return options.includeIncompatibleSchemaVersions
      ? entries
      : entries.filter((entry) => entry.schemaVersion === MANGABACLAW_AGENT_SCHEMA_VERSION);
  }
  // Discovery runs per row in list hot paths, so the legacy-schema gate and the
  // query share one process-held state handle instead of opening two connections.
  const entries = withExistingMangabaClawStateDatabaseReadOnly(({ db: database }) => {
    if (detectMangabaClawStateDatabaseSchemaMigrationsFromDatabase(database, pathname).length > 0) {
      throw new Error(
        `MangabaClaw state database ${pathname} has a legacy agent database registry schema; run mangabaclaw doctor --fix to migrate it.`,
      );
    }
    const registryTable = database
      .prepare("SELECT type FROM sqlite_master WHERE name = 'agent_databases'")
      .get() as { type?: unknown } | undefined;
    if (!registryTable) {
      return [];
    }
    if (registryTable.type !== "table") {
      throw new Error(`MangabaClaw state database ${pathname} has an invalid agent registry.`);
    }
    const db = getNodeSqliteKysely<MangabaClawAgentRegistryDatabase>(database);
    const rows = executeSqliteQuerySync(
      database,
      db
        .selectFrom("agent_databases")
        .selectAll()
        .orderBy("agent_id", "asc")
        .orderBy("path", "asc"),
    ).rows;
    return rows.map((row) => ({
      agentId: normalizeAgentId(row.agent_id),
      path: resolveMangabaClawRegisteredAgentDatabasePath(pathname, row.path),
      schemaVersion: row.schema_version,
      lastSeenAt: row.last_seen_at,
      sizeBytes: row.size_bytes,
    }));
  }, options);
  if (entries === undefined) {
    if (hasUnavailableMissingSqlitePath(pathname)) {
      throw new Error(`MangabaClaw state database ${pathname} is unavailable.`);
    }
    memo.entries = [];
    return [];
  }
  memo.entries = entries;
  const cloned = cloneRegisteredAgentDatabases(entries);
  return options.includeIncompatibleSchemaVersions
    ? cloned
    : cloned.filter((entry) => entry.schemaVersion === MANGABACLAW_AGENT_SCHEMA_VERSION);
}
