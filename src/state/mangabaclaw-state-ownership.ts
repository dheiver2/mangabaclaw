import { existsSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { isRecord } from "@mangabaclaw/normalization-core/record-coerce";
import { isGatewayExternallySupervised } from "../infra/gateway-supervision.js";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import { normalizeSqliteNonNegativeInteger } from "../infra/sqlite-busy-timeout.js";
import {
  createSqliteLifecycleAggregateError,
  runWithSqliteCoordinator,
} from "../infra/sqlite-coordinator.js";
import { quarantineOrphanedSqliteSidecars } from "../infra/sqlite-files.js";
import {
  prepareSqliteReadOnlyLocation,
  prepareSqliteReadOnlyLocationSync,
} from "../infra/sqlite-readonly-location.js";
import { isSqliteLockError } from "../infra/sqlite-transaction.js";
import {
  acquireStateDatabaseCoordinator,
  StateDatabaseCoordinatorContentionError,
} from "../infra/state-database-coordinator.js";
import { MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS } from "./mangabaclaw-state-db-contract.js";
import { tableExists } from "./mangabaclaw-state-db-schema-helpers.js";

export const STATE_SUPERVISION_KEY = "gateway.supervision";
const MAX_OWNERSHIP_TIMESTAMP_MS = 8_640_000_000_000_000;
const MANAGER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export type MangabaClawExternalStateOwnership = {
  claimedAt: number;
  managerId: string;
  mode: "external";
  version: 1;
};

export class MangabaClawStateOwnershipError extends Error {}

export function isMangabaClawStateWriteContentionError(error: unknown): boolean {
  return error instanceof StateDatabaseCoordinatorContentionError || isSqliteLockError(error);
}

export class MangabaClawStateOwnershipMetadataError extends MangabaClawStateOwnershipError {
  constructor(
    readonly databasePath: string,
    message: string,
  ) {
    super(
      `MangabaClaw shared state ownership metadata is invalid at ${databasePath}: ${message}. ` +
        "Repair it with MANGABACLAW_SUPERVISOR_MODE=external mangabaclaw database ownership claim --manager <manager-id>.",
    );
    this.name = "MangabaClawStateOwnershipMetadataError";
  }
}

class MangabaClawStateExternalOwnershipError extends MangabaClawStateOwnershipError {
  constructor(
    readonly databasePath: string,
    readonly managerId: string,
  ) {
    super(
      `MangabaClaw shared state database ${databasePath} is externally supervised by ${managerId}. ` +
        "Use that external supervisor with MANGABACLAW_SUPERVISOR_MODE=external for writable operations.",
    );
    this.name = "MangabaClawStateExternalOwnershipError";
  }
}

export function normalizeMangabaClawStateManagerId(managerId: string): string {
  const normalized = managerId.trim();
  if (!MANAGER_ID_PATTERN.test(normalized)) {
    throw new Error(
      "External state ownership manager id must be a 1-128 character ASCII identifier.",
    );
  }
  return normalized;
}

function parseExternalOwnership(
  valueJson: string,
  databasePath: string,
): MangabaClawExternalStateOwnership {
  let value: unknown;
  try {
    value = JSON.parse(valueJson) as unknown;
  } catch {
    throw new MangabaClawStateOwnershipMetadataError(databasePath, "reserved value is not valid JSON");
  }
  const record = isRecord(value) ? value : undefined;
  const keys = record ? Object.keys(record).toSorted().join(",") : "";
  const managerId = record?.managerId;
  const claimedAt = record?.claimedAt;
  if (
    keys !== "claimedAt,managerId,mode,version" ||
    record?.version !== 1 ||
    record?.mode !== "external" ||
    typeof managerId !== "string" ||
    !MANAGER_ID_PATTERN.test(managerId) ||
    typeof claimedAt !== "number" ||
    !Number.isSafeInteger(claimedAt) ||
    claimedAt < 0 ||
    claimedAt > MAX_OWNERSHIP_TIMESTAMP_MS
  ) {
    throw new MangabaClawStateOwnershipMetadataError(
      databasePath,
      "reserved value does not match the version 1 external ownership contract",
    );
  }
  return {
    version: 1,
    mode: "external",
    managerId,
    claimedAt,
  };
}

/** Inspect the reserved ownership row without entering the shared-state lifecycle. */
export function inspectMangabaClawStateOwnershipFromDatabase(
  database: DatabaseSync,
  databasePath: string,
): MangabaClawExternalStateOwnership | null {
  if (!tableExists(database, "config_machine_state")) {
    return null;
  }
  const row = database
    .prepare("SELECT value_json FROM config_machine_state WHERE state_key = ? LIMIT 1")
    .get(STATE_SUPERVISION_KEY) as { value_json?: unknown } | undefined;
  if (!row) {
    return null;
  }
  if (typeof row.value_json !== "string") {
    throw new MangabaClawStateOwnershipMetadataError(databasePath, "reserved value is not text");
  }
  return parseExternalOwnership(row.value_json, databasePath);
}

function inspectOwnershipThroughConnection(
  location: string,
  databasePath: string,
): MangabaClawExternalStateOwnership | null {
  const database = openNodeSqliteDatabase(location, { readOnly: true });
  try {
    database.exec(
      `PRAGMA busy_timeout = ${MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS}; PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;`,
    );
    return inspectMangabaClawStateOwnershipFromDatabase(database, databasePath);
  } finally {
    database.close();
  }
}

function inspectJournalAwarePublicOwnership(
  databasePath: string,
): MangabaClawExternalStateOwnership | null {
  const prepared = prepareSqliteReadOnlyLocationSync(databasePath);
  try {
    return inspectOwnershipThroughConnection(prepared.location, databasePath);
  } finally {
    prepared.cleanup();
  }
}

function inspectOwnershipWhileCoordinatorHeld(databasePath: string, busyTimeoutMs: number) {
  const resolvedPath = path.resolve(databasePath);
  if (!existsSync(resolvedPath)) {
    return null;
  }
  // Write admission owns locking and recovery while the coordinator is held.
  // Inspect the live committed view without cloning a potentially busy family.
  const database = openNodeSqliteDatabase(resolvedPath);
  try {
    database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}; PRAGMA trusted_schema = OFF;`);
    return inspectMangabaClawStateOwnershipFromDatabase(database, resolvedPath);
  } finally {
    database.close();
  }
}

function acquireMangabaClawStateOwnershipCoordinator(databasePath: string, busyTimeoutMs: number) {
  return acquireStateDatabaseCoordinator({
    databasePath,
    busyTimeoutMs,
  });
}

export function runWithMangabaClawStateOwnershipCoordinator<T>(
  databasePath: string,
  operationLabel: string,
  operation: () => T,
): T {
  return runWithSqliteCoordinator(
    acquireMangabaClawStateOwnershipCoordinator(databasePath, MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS),
    operationLabel,
    operation,
  );
}

/** Inspect one resolved state database path without mutating its state tree. */
export function inspectMangabaClawStateOwnershipAtPath(
  databasePath: string,
): MangabaClawExternalStateOwnership | null {
  const resolvedPath = path.resolve(databasePath);
  if (!existsSync(resolvedPath)) {
    return null;
  }
  return inspectJournalAwarePublicOwnership(resolvedPath);
}

function assertOwnershipAllowsWrite(
  status: MangabaClawExternalStateOwnership | null,
  databasePath: string,
  env: NodeJS.ProcessEnv,
): void {
  if (status && !isGatewayExternallySupervised(env)) {
    throw new MangabaClawStateExternalOwnershipError(databasePath, status.managerId);
  }
}

/** Fence and hold one path-based mutation until its main-file preamble is complete. */
function acquireMangabaClawStateWriteAccess(options: {
  databasePath: string;
  busyTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}): { release: () => void } {
  const resolvedPath = path.resolve(options.databasePath);
  const busyTimeoutMs = normalizeSqliteNonNegativeInteger(
    options.busyTimeoutMs ?? MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS,
    "busyTimeoutMs",
  );
  const access = acquireMangabaClawStateOwnershipCoordinator(resolvedPath, busyTimeoutMs);
  try {
    quarantineOrphanedSqliteSidecars(resolvedPath);
    assertOwnershipAllowsWrite(
      inspectOwnershipWhileCoordinatorHeld(resolvedPath, busyTimeoutMs),
      resolvedPath,
      options.env ?? process.env,
    );
    return access;
  } catch (operationError) {
    let releaseFailed = false;
    let releaseError: unknown;
    try {
      access.release();
    } catch (error) {
      releaseFailed = true;
      releaseError = error;
    }
    if (releaseFailed) {
      throw createSqliteLifecycleAggregateError(
        [operationError, releaseError],
        "state ownership inspection and coordinator release both failed",
        operationError,
      );
    }
    throw operationError;
  }
}

export function runWithMangabaClawStateWriteAccess<T>(
  options: { databasePath: string; busyTimeoutMs?: number; env?: NodeJS.ProcessEnv },
  operationLabel: string,
  operation: () => T,
): T {
  return runWithSqliteCoordinator(
    acquireMangabaClawStateWriteAccess(options),
    operationLabel,
    operation,
  );
}

/** Check write admission; callers may defer orphan-sidecar recovery until mutation is certain. */
export async function assertMangabaClawStateWriteAllowedAtPath(options: {
  databasePath: string;
  env?: NodeJS.ProcessEnv;
  recoverOrphanedSidecars?: boolean;
}): Promise<void> {
  const databasePath = path.resolve(options.databasePath);
  const recoverOrphanedSidecars = options.recoverOrphanedSidecars !== false;
  if (recoverOrphanedSidecars) {
    quarantineOrphanedSqliteSidecars(databasePath);
  }
  if (!existsSync(databasePath)) {
    return;
  }
  const env = options.env ?? process.env;
  if (recoverOrphanedSidecars && isGatewayExternallySupervised(env)) {
    runWithMangabaClawStateWriteAccess(
      { ...options, databasePath },
      "shared state write admission",
      () => undefined,
    );
    return;
  }
  const prepared = await prepareSqliteReadOnlyLocation(databasePath);
  try {
    assertOwnershipAllowsWrite(
      inspectOwnershipThroughConnection(prepared.location, databasePath),
      databasePath,
      env,
    );
  } finally {
    prepared.cleanup();
  }
}

/** Fence shared-state writes once an external manager has claimed ownership. */
export function assertMangabaClawStateWriteAllowed(options: {
  database: DatabaseSync;
  databasePath: string;
  env?: NodeJS.ProcessEnv;
}): void {
  const resolvedPath = path.resolve(options.databasePath);
  const status = inspectMangabaClawStateOwnershipFromDatabase(options.database, resolvedPath);
  assertOwnershipAllowsWrite(status, resolvedPath, options.env ?? process.env);
}
