import path from "node:path";
import {
  clearNodeSqliteKyselyCacheForDatabase,
  registerNodeSqliteKyselyQueryErrorHandler,
} from "../infra/kysely-sync.js";
import type { SqliteFileGeneration } from "../infra/sqlite-file-generation.js";
import { createSqliteTerminalOpenLatch } from "../infra/sqlite-terminal-open-latch.js";
import { isSqliteCorruptionError } from "../infra/sqlite-transaction.js";
import { readMangabaClawDatabaseQuarantine } from "./mangabaclaw-quarantine-store.js";
import type { MangabaClawStateDatabase } from "./mangabaclaw-state-db-contract.js";
import { createMangabaClawDatabaseVerificationError } from "./mangabaclaw-state-db-maintenance.js";

const cachedDatabases = new Map<string, MangabaClawStateDatabase>();
type MangabaClawStateDatabaseLifecycleEvent =
  | { kind: "opened"; database: MangabaClawStateDatabase }
  | { kind: "closed"; path: string }
  | { kind: "open-error"; path: string; error: unknown };
const databaseLifecycleListeners = new Set<(event: MangabaClawStateDatabaseLifecycleEvent) => void>();

function notifyMangabaClawStateDatabaseLifecycle(event: MangabaClawStateDatabaseLifecycleEvent): void {
  for (const listener of databaseLifecycleListeners) {
    listener(event);
  }
}

export function registerMangabaClawStateDatabaseLifecycleListener(
  listener: (event: MangabaClawStateDatabaseLifecycleEvent) => void,
): () => void {
  databaseLifecycleListeners.add(listener);
  for (const database of cachedDatabases.values()) {
    if (database.db.isOpen) {
      listener({ kind: "opened", database });
    }
  }
  return () => databaseLifecycleListeners.delete(listener);
}

type MangabaClawStateDatabaseCloseResult = {
  caught: boolean;
  errors: unknown[];
};

/** Close both physical-handle owners while retaining every cleanup failure. */
function closeMangabaClawStateDatabaseHandle(
  database: MangabaClawStateDatabase,
  options?: Parameters<MangabaClawStateDatabase["walMaintenance"]["close"]>[0],
): MangabaClawStateDatabaseCloseResult {
  let caught = false;
  const errors: unknown[] = [];
  try {
    database.walMaintenance.close(options);
  } catch (error) {
    caught = true;
    errors.push(error);
  }
  clearNodeSqliteKyselyCacheForDatabase(database.db);
  try {
    if (database.db.isOpen) {
      database.db.close();
    }
  } catch (error) {
    caught = true;
    errors.push(error);
  }
  return { caught, errors };
}

function evictCachedMangabaClawStateDatabase(database: MangabaClawStateDatabase): boolean {
  if (cachedDatabases.get(database.path) !== database) {
    return false;
  }
  // Remove ownership before cleanup. A poisoned native handle can reject close,
  // but it must never remain discoverable as the process-wide shared handle.
  cachedDatabases.delete(database.path);
  notifyMangabaClawStateDatabaseLifecycle({ kind: "closed", path: database.path });
  // A poisoned cache owner is not the database lifecycle owner. PASSIVE avoids
  // waiting on readers or resetting recovery frames another connection needs.
  closeMangabaClawStateDatabaseHandle(database, { checkpointMode: "PASSIVE" });
  return true;
}

/** Evict an exact cached shared-state owner after a proven corruption read. */
function evictMangabaClawStateDatabaseAfterCorruption(
  database: MangabaClawStateDatabase,
  error: unknown,
): boolean {
  return isSqliteCorruptionError(error) && evictCachedMangabaClawStateDatabase(database);
}

const terminalOpenLatch = createSqliteTerminalOpenLatch({
  closeByPath: (pathname) => {
    const cached = cachedDatabases.get(pathname);
    if (cached) {
      evictCachedMangabaClawStateDatabase(cached);
    }
  },
});

/** Publish a fully opened handle and bind query corruption to its exact cache owner. */
function publishMangabaClawStateDatabase(database: MangabaClawStateDatabase): MangabaClawStateDatabase {
  const { db, path: pathname } = database;
  cachedDatabases.set(pathname, database);
  notifyMangabaClawStateDatabaseLifecycle({ kind: "opened", database });
  registerNodeSqliteKyselyQueryErrorHandler(db, (error) => {
    // Write transactions own rollback and evict at their outer boundary.
    if (!db.isTransaction && isSqliteCorruptionError(error)) {
      evictCachedMangabaClawStateDatabase(database);
    }
  });
  terminalOpenLatch.clear(pathname);
  return database;
}

function getCachedMangabaClawStateDatabase(pathname: string): MangabaClawStateDatabase | undefined {
  return cachedDatabases.get(path.resolve(pathname));
}

function getMangabaClawStateDatabaseIfOpenAtPath(pathname: string): MangabaClawStateDatabase | undefined {
  const cached = getCachedMangabaClawStateDatabase(pathname);
  return cached?.db.isOpen ? cached : undefined;
}

/** Remove a closed cached owner while fresh-open access is held. */
function closeStaleCachedMangabaClawStateDatabase(database: MangabaClawStateDatabase): void {
  if (cachedDatabases.get(database.path) !== database) {
    return;
  }
  database.walMaintenance.close();
  clearNodeSqliteKyselyCacheForDatabase(database.db);
  cachedDatabases.delete(database.path);
  notifyMangabaClawStateDatabaseLifecycle({ kind: "closed", path: database.path });
}

/** Latch background verification damage so later opens fail without rescanning. */
function recordMangabaClawStateDatabaseOpenFailure(
  pathname: string,
  error: Error,
  generation?: SqliteFileGeneration,
): boolean {
  return terminalOpenLatch.record(pathname, error, generation);
}

/** Clear a terminal open failure after doctor rewrites the database file. */
function clearMangabaClawStateDatabaseOpenFailure(pathname: string): void {
  terminalOpenLatch.clear(pathname);
}

/** Reject shared-state access after a process-local terminal failure. */
function assertMangabaClawStateDatabaseOpenAllowed(pathname: string): void {
  const terminalFailure = terminalOpenLatch.get(pathname);
  if (terminalFailure) {
    throw terminalFailure;
  }
}

function recordMangabaClawStateDatabaseLifecycleOpenError(pathname: string, error: unknown): void {
  notifyMangabaClawStateDatabaseLifecycle({ kind: "open-error", path: path.resolve(pathname), error });
}

/** Reject a fresh shared-state open after known corruption until repair clears it. */
function assertMangabaClawStateDatabaseFreshOpenAllowedAtPath(
  pathname: string,
  env: NodeJS.ProcessEnv,
): void {
  assertMangabaClawStateDatabaseOpenAllowed(pathname);
  let quarantineFailure: Error | undefined;
  try {
    const quarantine = readMangabaClawDatabaseQuarantine(pathname, { env });
    if (quarantine) {
      quarantineFailure = createMangabaClawDatabaseVerificationError(
        "state",
        pathname,
        quarantine.reason,
      );
    }
  } catch {
    // A broken quarantine store must not brick every state read.
    // The process latch and daily verifier still cover known damage.
  }
  if (quarantineFailure) {
    throw quarantineFailure;
  }
}

/** Close one cached shared state database handle by exact pathname. */
function closeMangabaClawStateDatabaseByPath(pathname: string): boolean {
  const resolvedPath = path.resolve(pathname);
  const database = cachedDatabases.get(resolvedPath);
  if (!database) {
    return false;
  }
  database.walMaintenance.close();
  if (database.db.isOpen) {
    database.db.close();
  }
  cachedDatabases.delete(resolvedPath);
  notifyMangabaClawStateDatabaseLifecycle({ kind: "closed", path: resolvedPath });
  return true;
}

/** Close all cached shared state database handles. */
function closeMangabaClawStateDatabase(
  options?: Parameters<MangabaClawStateDatabase["walMaintenance"]["close"]>[0],
): void {
  for (const database of cachedDatabases.values()) {
    database.walMaintenance.close(options);
    if (database.db.isOpen) {
      database.db.close();
    }
    notifyMangabaClawStateDatabaseLifecycle({ kind: "closed", path: database.path });
  }
  cachedDatabases.clear();
}

/** Test whether any cached shared state database handle is still open. */
function isMangabaClawStateDatabaseOpen(): boolean {
  return Array.from(cachedDatabases.values()).some((database) => database.db.isOpen);
}

/** Close shared state handles and clear terminal failure latches for test isolation. */
function closeMangabaClawStateDatabaseForTest(): void {
  closeMangabaClawStateDatabase();
  terminalOpenLatch.clearAll();
}

/** Process-wide owner for cached shared-state handles and terminal open failures. */
export const mangabaClawStateDatabaseCache = {
  assertMangabaClawStateDatabaseFreshOpenAllowedAtPath,
  assertMangabaClawStateDatabaseOpenAllowed,
  clearMangabaClawStateDatabaseOpenFailure,
  closeMangabaClawStateDatabase,
  closeMangabaClawStateDatabaseByPath,
  closeMangabaClawStateDatabaseForTest,
  closeMangabaClawStateDatabaseHandle,
  closeStaleCachedMangabaClawStateDatabase,
  evictCachedMangabaClawStateDatabase,
  evictMangabaClawStateDatabaseAfterCorruption,
  getCachedMangabaClawStateDatabase,
  getMangabaClawStateDatabaseIfOpenAtPath,
  isMangabaClawStateDatabaseOpen,
  publishMangabaClawStateDatabase,
  recordMangabaClawStateDatabaseOpenFailure,
  recordMangabaClawStateDatabaseLifecycleOpenError,
};
