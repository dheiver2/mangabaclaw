import type { DatabaseSync } from "node:sqlite";
import { clearNodeSqliteKyselyCacheForDatabase } from "../infra/kysely-sync.js";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import {
  createNewerSqliteSchemaVersionError,
  readSqliteUserVersion,
} from "../infra/sqlite-user-version.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { MANGABACLAW_AGENT_SCHEMA_VERSION } from "./mangabaclaw-agent-db-contract.js";
import {
  assertExistingAgentSchemaOwner,
  assertMangabaClawAgentSchemaContains,
  assertSupportedAgentSchemaVersion,
  readExistingAgentSchemaMeta,
} from "./mangabaclaw-agent-db-schema-helpers.js";
import { ensureMangabaClawAgentDatabaseSchema } from "./mangabaclaw-agent-db-schema.js";
import { MANGABACLAW_AGENT_SCHEMA_SQL } from "./mangabaclaw-agent-schema.js";
import { MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS } from "./mangabaclaw-state-db.js";

/** Require exact agent ownership without requiring the latest schema. */
export function assertMangabaClawAgentDatabaseOwner(
  database: DatabaseSync,
  options: { agentId: string; pathname: string },
): NonNullable<ReturnType<typeof readExistingAgentSchemaMeta>> {
  const agentId = normalizeAgentId(options.agentId);
  const metadata = readExistingAgentSchemaMeta(database);
  if (!metadata) {
    throw new Error(
      `MangabaClaw agent database ${options.pathname} has no schema ownership metadata.`,
    );
  }
  assertExistingAgentSchemaOwner(metadata, agentId, options.pathname);
  if (metadata.agentId !== agentId) {
    throw new Error(
      `MangabaClaw agent database ${options.pathname} belongs to agent ${metadata.agentId}; requested agent ${agentId}.`,
    );
  }
  return metadata;
}

/** Require the exact agent owner and schema before offline file maintenance. */
export function assertMangabaClawAgentDatabaseForMaintenance(
  database: DatabaseSync,
  options: { agentId: string; pathname: string },
): void {
  const metadata = assertMangabaClawAgentDatabaseOwner(database, options);

  const userVersion = readSqliteUserVersion(database);
  if (userVersion > MANGABACLAW_AGENT_SCHEMA_VERSION) {
    throw createNewerSqliteSchemaVersionError(
      "MangabaClaw agent database",
      options.pathname,
      userVersion,
      MANGABACLAW_AGENT_SCHEMA_VERSION,
    );
  }
  if (userVersion !== MANGABACLAW_AGENT_SCHEMA_VERSION) {
    throw new Error(
      `MangabaClaw agent database ${options.pathname} uses schema version ${userVersion}; run mangabaclaw doctor --fix before compacting it.`,
    );
  }
  if (metadata.schemaVersion !== MANGABACLAW_AGENT_SCHEMA_VERSION) {
    throw new Error(
      `MangabaClaw agent database ${options.pathname} metadata schema version ${metadata.schemaVersion ?? "invalid"} does not match ${MANGABACLAW_AGENT_SCHEMA_VERSION}; run mangabaclaw doctor --fix before compacting it.`,
    );
  }
  assertMangabaClawAgentSchemaContains(database, options.pathname, MANGABACLAW_AGENT_SCHEMA_SQL);
}

/** Upgrade or repair a supported owned schema before strict offline maintenance. */
export function migrateMangabaClawAgentDatabaseForMaintenance(options: {
  agentId: string;
  pathname: string;
}): void {
  const agentId = normalizeAgentId(options.agentId);
  const database = openNodeSqliteDatabase(options.pathname);
  try {
    database.exec(`PRAGMA busy_timeout = ${MANGABACLAW_SQLITE_BUSY_TIMEOUT_MS};`);
    const metadata = readExistingAgentSchemaMeta(database);
    if (!metadata) {
      return;
    }
    assertExistingAgentSchemaOwner(metadata, agentId, options.pathname);
    assertSupportedAgentSchemaVersion(database, options.pathname);
    const userVersion = readSqliteUserVersion(database);
    const metadataVersion = metadata.schemaVersion;
    const hasCurrentVersion =
      userVersion === MANGABACLAW_AGENT_SCHEMA_VERSION &&
      metadataVersion === MANGABACLAW_AGENT_SCHEMA_VERSION;
    const hasSupportedOlderVersion =
      userVersion >= 1 &&
      userVersion < MANGABACLAW_AGENT_SCHEMA_VERSION &&
      metadataVersion !== null &&
      metadataVersion === userVersion &&
      metadataVersion >= 1 &&
      metadataVersion < MANGABACLAW_AGENT_SCHEMA_VERSION;
    if (!hasCurrentVersion && !hasSupportedOlderVersion) {
      return;
    }
    ensureMangabaClawAgentDatabaseSchema(database, {
      agentId,
      path: options.pathname,
    });
    assertMangabaClawAgentDatabaseForMaintenance(database, {
      agentId,
      pathname: options.pathname,
    });
  } finally {
    clearNodeSqliteKyselyCacheForDatabase(database);
    database.close();
  }
}
