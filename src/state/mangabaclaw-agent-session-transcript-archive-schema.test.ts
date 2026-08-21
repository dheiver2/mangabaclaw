import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { assertSqliteSchemaContains } from "../infra/sqlite-schema-contract.js";
import {
  closeMangabaClawAgentDatabasesForTest,
  openMangabaClawAgentDatabase,
} from "./mangabaclaw-agent-db.js";
import { MANGABACLAW_AGENT_SCHEMA_SQL } from "./mangabaclaw-agent-schema.js";
import {
  ensureSessionTranscriptArchiveSchema,
  SESSION_TRANSCRIPT_ARCHIVES_TABLE,
} from "./mangabaclaw-agent-session-transcript-archive-schema.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

afterEach(() => {
  closeMangabaClawAgentDatabasesForTest();
});

function schemaWithoutTranscriptArchives(): string {
  const start = MANGABACLAW_AGENT_SCHEMA_SQL.indexOf(
    `CREATE TABLE IF NOT EXISTS ${SESSION_TRANSCRIPT_ARCHIVES_TABLE} (`,
  );
  const end = MANGABACLAW_AGENT_SCHEMA_SQL.indexOf(
    "CREATE TABLE IF NOT EXISTS transcript_rewrite_watermarks (",
    start,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return `${MANGABACLAW_AGENT_SCHEMA_SQL.slice(0, start)}${MANGABACLAW_AGENT_SCHEMA_SQL.slice(end)}`;
}

describe("session transcript archive schema", () => {
  it("keeps a current database table-free until first archive use without changing its version", () => {
    const stateDir = tempDirs.make("mangabaclaw-session-archive-schema-");
    const options = { agentId: "main", env: { MANGABACLAW_STATE_DIR: stateDir } };
    const initial = openMangabaClawAgentDatabase(options);
    const databasePath = initial.path;
    closeMangabaClawAgentDatabasesForTest();

    const shipped = new DatabaseSync(databasePath);
    shipped.exec(`
      DROP INDEX idx_agent_session_transcript_archives_pending;
      DROP INDEX idx_agent_session_transcript_archives_retention;
      DROP TABLE ${SESSION_TRANSCRIPT_ARCHIVES_TABLE};
    `);
    const versionBefore = shipped.prepare("PRAGMA user_version").get();
    const metadataBefore = shipped
      .prepare("SELECT schema_version, updated_at FROM schema_meta WHERE meta_key = 'primary'")
      .get();
    shipped.close();

    const reopened = openMangabaClawAgentDatabase(options);
    expect(
      reopened.db
        .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
        .get(SESSION_TRANSCRIPT_ARCHIVES_TABLE),
    ).toBeUndefined();

    ensureSessionTranscriptArchiveSchema(reopened.db);

    expect(
      reopened.db
        .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
        .get(SESSION_TRANSCRIPT_ARCHIVES_TABLE),
    ).toEqual({ 1: 1 });
    expect(reopened.db.prepare("PRAGMA user_version").get()).toEqual(versionBefore);
    expect(
      reopened.db
        .prepare("SELECT schema_version, updated_at FROM schema_meta WHERE meta_key = 'primary'")
        .get(),
    ).toEqual(metadataBefore);
  });

  it("keeps a populated additive archive table usable by the previous schema contract", () => {
    const database = new DatabaseSync(":memory:");
    try {
      database.exec(MANGABACLAW_AGENT_SCHEMA_SQL);
      database
        .prepare(
          `INSERT INTO ${SESSION_TRANSCRIPT_ARCHIVES_TABLE} (
             session_id, generation, session_key, reason, encoding, archive_blob, archive_sha256,
             archive_name, created_at
           ) VALUES (?, ?, ?, 'deleted', 'identity', ?, ?, ?, ?)`,
        )
        .run(
          "session-1",
          "generation-1",
          "agent:main:session-1",
          Buffer.from("{}\n"),
          "ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356",
          "session-1.jsonl.deleted.2026-08-14T00-00-00.000Z",
          Date.now(),
        );

      expect(() =>
        assertSqliteSchemaContains(
          database,
          "previous agent schema",
          schemaWithoutTranscriptArchives(),
        ),
      ).not.toThrow();
      expect(
        database.prepare("SELECT archive_name FROM session_transcript_archives").get(),
      ).toEqual({ archive_name: "session-1.jsonl.deleted.2026-08-14T00-00-00.000Z" });
    } finally {
      database.close();
    }
  });

  it("rejects a drifted archive table instead of treating it as an optional absence", () => {
    const stateDir = tempDirs.make("mangabaclaw-session-archive-drift-");
    const options = { agentId: "main", env: { MANGABACLAW_STATE_DIR: stateDir } };
    const initial = openMangabaClawAgentDatabase(options);
    const databasePath = initial.path;
    closeMangabaClawAgentDatabasesForTest();

    const drifted = new DatabaseSync(databasePath);
    drifted.exec(`
      DROP INDEX idx_agent_session_transcript_archives_pending;
      DROP INDEX idx_agent_session_transcript_archives_retention;
      DROP TABLE ${SESSION_TRANSCRIPT_ARCHIVES_TABLE};
      CREATE TABLE ${SESSION_TRANSCRIPT_ARCHIVES_TABLE} (
        session_id TEXT NOT NULL PRIMARY KEY,
        archive_blob BLOB NOT NULL
      ) STRICT;
    `);
    drifted.close();

    expect(() => openMangabaClawAgentDatabase(options)).toThrow(/session_transcript_archives|schema/u);
  });
});
