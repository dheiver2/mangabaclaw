import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupTempDirs,
  makeTempDir,
  useAutoCleanupTempDirTracker,
} from "../../../test/helpers/temp-dir.js";
import {
  closeMangabaClawAgentDatabasesForTest,
  isMangabaClawAgentDatabaseOpen,
  openMangabaClawAgentDatabase,
  resolveMangabaClawAgentSqlitePath,
} from "../../state/mangabaclaw-agent-db.js";
import {
  closeMangabaClawStateDatabaseForTest,
  openMangabaClawStateDatabase,
} from "../../state/mangabaclaw-state-db.js";
import {
  hasSessionEntriesByStatusReadOnly,
  listSessionEntriesCore,
  listSessionEntriesReadOnly,
  readSessionIdentityEvidenceBatch,
  resolveTranscriptSessionKeyBySessionId,
  upsertSessionEntryCore,
} from "./session-accessor.js";

const tempDirs: string[] = [];
const autoTempDirs = useAutoCleanupTempDirTracker(afterEach);

function countRegisteredAgentDatabases(env: NodeJS.ProcessEnv): number {
  const row = openMangabaClawStateDatabase({ env })
    .db.prepare("SELECT count(*) AS count FROM agent_databases")
    .get() as { count: number };
  return row.count;
}

function clearRegisteredAgentDatabases(env: NodeJS.ProcessEnv): void {
  openMangabaClawStateDatabase({ env }).db.prepare("DELETE FROM agent_databases").run();
}

afterEach(() => {
  closeMangabaClawAgentDatabasesForTest();
  closeMangabaClawStateDatabaseForTest();
  cleanupTempDirs(tempDirs);
});

describe("session accessor readonly listing", () => {
  it("returns the same entries as the writable listing for a populated agent database", async () => {
    const stateDir = makeTempDir(tempDirs, "mangabaclaw-session-readonly-populated-");
    const env = { MANGABACLAW_STATE_DIR: stateDir };
    const listScope = { agentId: "worker-1", env };

    await upsertSessionEntryCore(
      { ...listScope, sessionKey: "agent:worker-1:main" },
      { sessionId: "session-1", updatedAt: 10 },
    );
    await upsertSessionEntryCore(
      { ...listScope, sessionKey: "agent:worker-1:telegram:dm:42" },
      { sessionId: "session-2", updatedAt: 20 },
    );
    const writableEntries = listSessionEntriesCore(listScope);
    closeMangabaClawAgentDatabasesForTest();

    expect(listSessionEntriesReadOnly(listScope)).toEqual(writableEntries);
  });

  it("returns an empty list without creating or registering a missing agent database", () => {
    const stateDir = makeTempDir(tempDirs, "mangabaclaw-session-readonly-missing-");
    const env = { MANGABACLAW_STATE_DIR: stateDir };
    const agentId = "worker-1";
    const databasePath = resolveMangabaClawAgentSqlitePath({ agentId, env });
    clearRegisteredAgentDatabases(env);

    expect(listSessionEntriesReadOnly({ agentId, env })).toEqual([]);
    expect(fs.existsSync(databasePath)).toBe(false);
    expect(countRegisteredAgentDatabases(env)).toBe(0);
  });

  it("probes lifecycle status without creating or registering a missing database", () => {
    const stateDir = makeTempDir(tempDirs, "mangabaclaw-session-readonly-status-missing-");
    const env = { MANGABACLAW_STATE_DIR: stateDir };
    const agentId = "worker-1";
    const databasePath = resolveMangabaClawAgentSqlitePath({ agentId, env });
    clearRegisteredAgentDatabases(env);

    expect(hasSessionEntriesByStatusReadOnly({ agentId, env }, ["running"])).toBe(false);
    expect(fs.existsSync(databasePath)).toBe(false);
    expect(countRegisteredAgentDatabases(env)).toBe(0);
  });

  it("distinguishes non-session agent state from a running session row", async () => {
    const stateDir = makeTempDir(tempDirs, "mangabaclaw-session-readonly-status-existing-");
    const env = { MANGABACLAW_STATE_DIR: stateDir };
    const agentId = "worker-1";
    const databasePath = resolveMangabaClawAgentSqlitePath({ agentId, env });
    openMangabaClawAgentDatabase({ agentId, env, path: databasePath });
    closeMangabaClawAgentDatabasesForTest();
    clearRegisteredAgentDatabases(env);

    expect(hasSessionEntriesByStatusReadOnly({ agentId, env }, ["running"])).toBe(false);
    expect(countRegisteredAgentDatabases(env)).toBe(0);

    await upsertSessionEntryCore(
      { agentId, env, sessionKey: "agent:worker-1:main" },
      { sessionId: "session-1", status: "running", updatedAt: 10 },
    );
    closeMangabaClawAgentDatabasesForTest();
    clearRegisteredAgentDatabases(env);

    expect(hasSessionEntriesByStatusReadOnly({ agentId, env }, ["running"])).toBe(true);
    expect(hasSessionEntriesByStatusReadOnly({ agentId, env }, ["done"])).toBe(false);
    expect(countRegisteredAgentDatabases(env)).toBe(0);
  });

  it("resolves a missing session identity without creating or registering a database", () => {
    const stateDir = makeTempDir(tempDirs, "mangabaclaw-session-readonly-missing-identity-");
    const env = { MANGABACLAW_STATE_DIR: stateDir };
    const agentId = "worker-1";
    const databasePath = resolveMangabaClawAgentSqlitePath({ agentId, env });
    clearRegisteredAgentDatabases(env);

    expect(
      resolveTranscriptSessionKeyBySessionId({ agentId, env, sessionId: "missing-session" }),
    ).toBeUndefined();
    expect(fs.existsSync(databasePath)).toBe(false);
    expect(countRegisteredAgentDatabases(env)).toBe(0);
  });

  it("resolves an existing session identity without registering its database", async () => {
    const stateDir = makeTempDir(tempDirs, "mangabaclaw-session-readonly-existing-identity-");
    const env = { MANGABACLAW_STATE_DIR: stateDir };
    const agentId = "worker-1";
    const sessionKey = "agent:worker-1:main";
    await upsertSessionEntryCore(
      { agentId, env, sessionKey },
      { sessionId: "session-1", updatedAt: 1 },
    );
    closeMangabaClawAgentDatabasesForTest();
    clearRegisteredAgentDatabases(env);

    expect(resolveTranscriptSessionKeyBySessionId({ agentId, env, sessionId: "session-1" })).toBe(
      sessionKey,
    );
    expect(countRegisteredAgentDatabases(env)).toBe(0);
  });

  it("batches exact, moved, absent, and unreadable session identity evidence", async () => {
    const stateDir = autoTempDirs.make("mangabaclaw-session-readonly-evidence-");
    const env = { MANGABACLAW_STATE_DIR: stateDir };
    const agentId = "worker-1";
    const sessionKey = "agent:worker-1:moved";
    const sessionId = "session-1";
    await upsertSessionEntryCore({ agentId, env, sessionKey }, { sessionId, updatedAt: 1 });
    const storePath = resolveMangabaClawAgentSqlitePath({ agentId, env });
    const invalidSessionKey = "agent:worker-1:invalid";
    await upsertSessionEntryCore(
      { agentId, env, sessionKey: invalidSessionKey },
      { sessionId: "invalid-session", updatedAt: 1 },
    );
    openMangabaClawAgentDatabase({ agentId, env })
      .db.prepare("UPDATE session_nodes SET entry_valid = 0 WHERE session_key = ?")
      .run(invalidSessionKey);
    const migrationInvalidAgentId = "migration-invalid";
    const migrationInvalidSessionKey = "agent:migration-invalid:main";
    await upsertSessionEntryCore(
      { agentId: migrationInvalidAgentId, env, sessionKey: migrationInvalidSessionKey },
      { sessionId: "migration-invalid-session", updatedAt: 1 },
    );
    const invalidDatabase = openMangabaClawAgentDatabase({ agentId: migrationInvalidAgentId, env });
    invalidDatabase.db.exec("PRAGMA user_version = 999;");
    const invalidStorePath = invalidDatabase.path;
    const missingAgentId = "missing";
    const missingStorePath = resolveMangabaClawAgentSqlitePath({ agentId: missingAgentId, env });
    const unreadableAgentId = "unreadable";
    const unreadableStorePath = resolveMangabaClawAgentSqlitePath({
      agentId: unreadableAgentId,
      env,
    });
    fs.mkdirSync(unreadableStorePath, { recursive: true });

    expect(
      readSessionIdentityEvidenceBatch([
        { agentId, sessionId, sessionKey, storePath },
        {
          agentId,
          sessionId,
          sessionKey: "agent:worker-1:old-key",
          storePath,
        },
        { agentId, sessionId: "missing-session", sessionKey, storePath },
        {
          agentId,
          sessionId: "invalid-session",
          sessionKey: invalidSessionKey,
          storePath,
        },
        {
          agentId: missingAgentId,
          sessionId: "missing-session",
          sessionKey: "agent:missing:main",
          storePath: missingStorePath,
        },
        {
          agentId: migrationInvalidAgentId,
          sessionId: "migration-invalid-session",
          sessionKey: migrationInvalidSessionKey,
          storePath: invalidStorePath,
        },
        {
          agentId: unreadableAgentId,
          sessionId: "unreadable-session",
          sessionKey: "agent:unreadable:main",
          storePath: unreadableStorePath,
        },
      ]),
    ).toEqual([
      { status: "current", sessionKey },
      { status: "current", sessionKey },
      { status: "absent" },
      { status: "unknown", reason: "row-invalid" },
      { status: "absent" },
      { status: "unknown", reason: "read-failed" },
      { status: "unknown", reason: "read-failed" },
    ]);
  });

  it("rejects stale valid projections for unreadable session identity evidence", async () => {
    const stateDir = autoTempDirs.make("mangabaclaw-session-readonly-stale-valid-evidence-");
    const env = { MANGABACLAW_STATE_DIR: stateDir };
    const agentId = "worker-1";
    const sessionId = "session-1";
    const sessionKey = "agent:worker-1:main";
    await upsertSessionEntryCore({ agentId, env, sessionKey }, { sessionId, updatedAt: 1 });
    const readableSessionId = "session-2";
    const readableSessionKey = "agent:worker-1:readable";
    await upsertSessionEntryCore(
      { agentId, env, sessionKey: readableSessionKey },
      { sessionId: readableSessionId, updatedAt: 1 },
    );
    const database = openMangabaClawAgentDatabase({ agentId, env });
    database.db
      .prepare("UPDATE session_nodes SET entry_json = ? WHERE session_key = ?")
      .run(JSON.stringify({ sessionId: "mismatched-session", updatedAt: 1 }), sessionKey);
    database.db
      .prepare("UPDATE session_nodes SET entry_valid = 1 WHERE session_key = ?")
      .run(sessionKey);

    expect(
      readSessionIdentityEvidenceBatch([
        { agentId, sessionId, sessionKey, storePath: database.path },
        {
          agentId,
          sessionId,
          sessionKey: "agent:worker-1:old-key",
          storePath: database.path,
        },
        {
          agentId,
          sessionId: readableSessionId,
          sessionKey: readableSessionKey,
          storePath: database.path,
        },
      ]),
    ).toEqual([
      { status: "unknown", reason: "row-invalid" },
      { status: "unknown", reason: "row-invalid" },
      { status: "current", sessionKey: readableSessionKey },
    ]);
  });

  it("uses the current-session-id index for fallback identity probes", async () => {
    const stateDir = autoTempDirs.make("mangabaclaw-session-readonly-evidence-index-");
    const env = { MANGABACLAW_STATE_DIR: stateDir };
    const agentId = "worker-1";
    const database = openMangabaClawAgentDatabase({ agentId, env });
    const detail = database.db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT session_key FROM session_nodes WHERE current_session_id IN (?)",
      )
      .all("session-1")
      .map((row) => {
        const rowDetail = (row as { detail?: unknown }).detail;
        return typeof rowDetail === "string" ? rowDetail : "";
      })
      .join(" ");

    expect(detail).toContain("idx_agent_session_nodes_current_session_id");
  });

  it("does not register a populated database during readonly health-style listing", async () => {
    const stateDir = makeTempDir(tempDirs, "mangabaclaw-session-readonly-registry-");
    const env = { MANGABACLAW_STATE_DIR: stateDir };
    const agentId = "worker-1";
    const scope = { agentId, env };

    await upsertSessionEntryCore(
      { ...scope, sessionKey: "agent:worker-1:main" },
      { sessionId: "session-1", updatedAt: 10 },
    );
    const databasePath = resolveMangabaClawAgentSqlitePath({ agentId, env });
    closeMangabaClawAgentDatabasesForTest();
    clearRegisteredAgentDatabases(env);

    expect(listSessionEntriesReadOnly(scope)).toHaveLength(1);
    expect(countRegisteredAgentDatabases(env)).toBe(0);
    expect(isMangabaClawAgentDatabaseOpen(databasePath)).toBe(false);
  });
});
