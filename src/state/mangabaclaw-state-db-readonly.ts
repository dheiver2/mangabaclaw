import { statSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { clearNodeSqliteKyselyCacheForDatabase } from "../infra/kysely-sync.js";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import { prepareSqliteReadOnlyLocationSync } from "../infra/sqlite-readonly-location.js";
import {
  createNewerSqliteSchemaVersionError,
  readSqliteUserVersion,
} from "../infra/sqlite-user-version.js";
import {
  assertMangabaClawStateDatabaseFreshOpenAllowed,
  evictMangabaClawStateDatabaseAfterCorruption,
  getMangabaClawStateDatabaseIfOpen,
  MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS,
  MANGABACLAW_STATE_SCHEMA_VERSION,
  type MangabaClawStateDatabaseOptions,
} from "./mangabaclaw-state-db.js";
import { resolveMangabaClawStateSqlitePath } from "./mangabaclaw-state-db.paths.js";

type MangabaClawStateReadOnlyDatabase = {
  db: DatabaseSync;
  path: string;
};

type ReusedMangabaClawStateReadOnlyDatabase<T> = { reused: false } | { reused: true; value: T };

function resolveReadOnlyPath(options: MangabaClawStateDatabaseOptions): string {
  return path.resolve(options.path ?? resolveMangabaClawStateSqlitePath(options.env ?? process.env));
}

function existingPathOrUndefined(pathname: string): string | undefined {
  try {
    statSync(pathname);
    return pathname;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function assertSupportedSchemaVersion(db: DatabaseSync, pathname: string): void {
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

function withMangabaClawStateDatabaseReadOnlyIfOpen<T>(
  operation: (database: MangabaClawStateReadOnlyDatabase) => T,
  options: MangabaClawStateDatabaseOptions,
  pathname: string,
): ReusedMangabaClawStateReadOnlyDatabase<T> {
  const opened = getMangabaClawStateDatabaseIfOpen(options);
  if (!opened || opened.db.isTransaction) {
    return { reused: false };
  }
  try {
    // Process-local terminal failures evict this handle. Persisted quarantine
    // is checked on the next physical open so hot reads do not poll metadata.
    // A newer build can migrate this file while the handle stays open, so the
    // forward-compatibility gate still runs before any reused read.
    assertSupportedSchemaVersion(opened.db, pathname);
    return { reused: true, value: operation(opened) };
  } catch (error) {
    evictMangabaClawStateDatabaseAfterCorruption(opened, error);
    throw error;
  }
}

function withFreshMangabaClawStateDatabaseReadOnly<T>(
  operation: (database: MangabaClawStateReadOnlyDatabase) => T,
  options: MangabaClawStateDatabaseOptions,
  pathname: string,
  location = pathname,
): T {
  assertMangabaClawStateDatabaseFreshOpenAllowed(options);
  const db = openNodeSqliteDatabase(location, { readOnly: true });
  try {
    db.exec(`PRAGMA busy_timeout = ${MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS};`);
    assertSupportedSchemaVersion(db, pathname);
    return operation({ db, path: pathname });
  } finally {
    clearNodeSqliteKyselyCacheForDatabase(db);
    db.close();
  }
}

/**
 * Read shared state without joining the writable lifecycle.
 *
 * CLI metadata reads can overlap a live Gateway. Keep them off schema repair,
 * journal-mode setup, checkpoints, and permission mutation owned by writers.
 */
export function withMangabaClawStateDatabaseReadOnly<T>(
  operation: (database: MangabaClawStateReadOnlyDatabase) => T,
  options: MangabaClawStateDatabaseOptions = {},
): T {
  const pathname = resolveReadOnlyPath(options);
  // Reusing a handle this process already holds keeps row loops cheap: opening
  // and closing a connection per call made shared-state reads scale with row
  // count. An in-flight transaction is skipped so callers never observe
  // uncommitted rows a fresh read-only connection could not have seen.
  const reused = withMangabaClawStateDatabaseReadOnlyIfOpen(operation, options, pathname);
  if (reused.reused) {
    return reused.value;
  }
  return withFreshMangabaClawStateDatabaseReadOnly(operation, options, pathname);
}

/** Read existing shared state while preserving non-missing filesystem failures. */
export function withExistingMangabaClawStateDatabaseReadOnly<T>(
  operation: (database: MangabaClawStateReadOnlyDatabase) => T,
  options: MangabaClawStateDatabaseOptions = {},
): T | undefined {
  const pathname = resolveReadOnlyPath(options);
  const reused = withMangabaClawStateDatabaseReadOnlyIfOpen(operation, options, pathname);
  if (reused.reused) {
    return reused.value;
  }
  const existingPath = existingPathOrUndefined(pathname);
  return existingPath === undefined
    ? undefined
    : withFreshMangabaClawStateDatabaseReadOnly(
        operation,
        { ...options, path: existingPath },
        existingPath,
      );
}

/** Read existing shared state without creating or updating its SQLite sidecars. */
export function withExistingMangabaClawStateDatabaseArtifactPreservingReadOnly<T>(
  operation: (database: MangabaClawStateReadOnlyDatabase) => T,
  options: MangabaClawStateDatabaseOptions = {},
): T | undefined {
  const pathname = resolveReadOnlyPath(options);
  const reused = withMangabaClawStateDatabaseReadOnlyIfOpen(operation, options, pathname);
  if (reused.reused) {
    return reused.value;
  }
  const existingPath = existingPathOrUndefined(pathname);
  if (existingPath === undefined) {
    return undefined;
  }
  const prepared = prepareSqliteReadOnlyLocationSync(existingPath);
  try {
    return withFreshMangabaClawStateDatabaseReadOnly(
      operation,
      { ...options, path: existingPath },
      existingPath,
      prepared.location,
    );
  } finally {
    prepared.cleanup();
  }
}
