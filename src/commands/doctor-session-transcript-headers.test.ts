import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../agents/sessions/session-manager.js";
import {
  loadTranscriptEventsSync,
  replaceTranscriptEventsSync,
  upsertSessionEntryCore,
} from "../config/sessions/session-accessor.js";
import { readTranscriptStorageRows } from "../config/sessions/session-accessor.sqlite-read.js";
import { CURRENT_SESSION_VERSION } from "../config/sessions/version.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import {
  closeMangabaClawAgentDatabasesForTest,
  openMangabaClawAgentDatabase,
  runMangabaClawAgentWriteTransaction,
} from "../state/mangabaclaw-agent-db.js";
import { closeMangabaClawStateDatabaseForTest } from "../state/mangabaclaw-state-db.js";
import {
  createMangabaClawTestState,
  type MangabaClawTestState,
} from "../test-utils/mangabaclaw-test-state.js";

const note = vi.hoisted(() => vi.fn());

vi.mock("../../packages/terminal-core/src/note.js", () => ({ note }));

import { noteSessionTranscriptHeaderHealth } from "./doctor-session-transcript-headers.js";

const AGENT_ID = "main";
const SESSION_ID = "headerless-session";
const SESSION_KEY = "agent:main:headerless-session";
const SPAWNED_CWD = "/workspace/headerless-child";

describe("doctor SQLite session transcript header repair", () => {
  let state: MangabaClawTestState;
  let cfg: MangabaClawConfig;
  let scope: {
    agentId: string;
    env: NodeJS.ProcessEnv;
    sessionId: string;
    sessionKey: string;
    storePath: string;
  };

  beforeEach(async () => {
    note.mockClear();
    state = await createMangabaClawTestState({
      layout: "state-only",
      prefix: "mangabaclaw-doctor-transcript-headers-",
    });
    cfg = {
      agents: { list: [{ id: AGENT_ID, workspace: state.workspaceDir }] },
    };
    scope = {
      agentId: AGENT_ID,
      env: state.env,
      sessionId: SESSION_ID,
      sessionKey: SESSION_KEY,
      storePath: path.join(state.sessionsDir(AGENT_ID), "sessions.json"),
    };
  });

  afterEach(async () => {
    closeMangabaClawAgentDatabasesForTest();
    closeMangabaClawStateDatabaseForTest();
    await state.cleanup();
  });

  async function seedHeaderlessTranscript(
    events: readonly unknown[],
    options: { spawnedCwd?: string } = { spawnedCwd: SPAWNED_CWD },
  ): Promise<void> {
    await upsertSessionEntryCore(scope, {
      sessionId: SESSION_ID,
      ...(options.spawnedCwd ? { spawnedCwd: options.spawnedCwd } : {}),
      updatedAt: 10,
    });
    expect(replaceTranscriptEventsSync(scope, [...events])).toBe(true);
  }

  it("detects read-only, repairs atomically, and keeps event identities stable", async () => {
    await seedHeaderlessTranscript([
      {
        type: "model_change",
        id: "model-1",
        parentId: null,
        timestamp: "2026-07-15T21:23:03.632Z",
        provider: "github-copilot",
        modelId: "claude-opus-4.8",
      },
      {
        type: "message",
        id: "user-1",
        parentId: "model-1",
        timestamp: "2026-07-15T21:23:03.698Z",
        message: { role: "user", content: "Is all good?" },
      },
      {
        type: "leaf",
        id: "leaf-1",
        parentId: "user-1",
        targetId: "user-1",
        timestamp: "2026-07-15T21:23:03.699Z",
      },
    ]);
    const databaseOptions = { agentId: AGENT_ID, env: state.env };
    const database = openMangabaClawAgentDatabase(databaseOptions);
    const beforeRows = readTranscriptStorageRows(database, SESSION_ID);
    runMangabaClawAgentWriteTransaction((transactionDatabase) => {
      transactionDatabase.db
        .prepare(
          "UPDATE session_windows SET transcript_updated_at = ?, transcript_observed_at = ? WHERE session_id = ?",
        )
        .run(1_000_000, 999_000, SESSION_ID);
    }, databaseOptions);

    expect(() => SessionManager.open(scope, state.workspaceDir)).toThrow(
      "require doctor/import migration before runtime use",
    );

    await expect(
      noteSessionTranscriptHeaderHealth({ cfg, env: state.env, shouldRepair: false }),
    ).resolves.toEqual({ found: 1, repaired: 0 });
    expect(readTranscriptStorageRows(database, SESSION_ID)).toEqual(beforeRows);
    expect(note).toHaveBeenCalledWith(
      '- Found 1 canonical session transcript without a header.\n- Run "mangabaclaw doctor --fix" to repair it before resuming the session.',
      "Session transcript headers",
    );

    note.mockClear();
    await expect(
      noteSessionTranscriptHeaderHealth({ cfg, env: state.env, shouldRepair: true }),
    ).resolves.toEqual({ found: 1, repaired: 1 });

    const repairedRows = readTranscriptStorageRows(database, SESSION_ID);
    const repairedEvents = repairedRows.map((row) => JSON.parse(row.eventJson));
    expect(repairedEvents[0]).toMatchObject({
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: SESSION_ID,
      cwd: SPAWNED_CWD,
      timestamp: new Date(beforeRows[0]?.createdAt ?? 0).toISOString(),
    });
    expect(
      repairedEvents.slice(1).map((event) => ({
        id: event.id,
        parentId: event.parentId,
        targetId: event.targetId,
      })),
    ).toEqual([
      { id: "model-1", parentId: null, targetId: undefined },
      { id: "user-1", parentId: "model-1", targetId: undefined },
      { id: "leaf-1", parentId: "user-1", targetId: "user-1" },
    ]);
    expect(repairedRows.slice(1).map((row) => row.createdAt)).toEqual(
      beforeRows.map((row) => row.createdAt),
    );
    expect(repairedRows.map((row) => row.seq)).toEqual([0, 1, 2, 3]);

    const identities = database.db
      .prepare(
        "SELECT event_id, parent_id, seq FROM transcript_event_identities WHERE session_id = ? ORDER BY seq ASC",
      )
      .all(SESSION_ID);
    expect(identities).toEqual([
      { event_id: SESSION_ID, parent_id: null, seq: 0 },
      { event_id: "model-1", parent_id: null, seq: 1 },
      { event_id: "user-1", parent_id: "model-1", seq: 2 },
      { event_id: "leaf-1", parent_id: "user-1", seq: 3 },
    ]);
    expect(
      database.db
        .prepare(
          "SELECT event_seq FROM session_transcript_active_events WHERE session_id = ? ORDER BY active_position ASC",
        )
        .all(SESSION_ID),
    ).toEqual([{ event_seq: 1 }, { event_seq: 2 }]);
    expect(
      database.db
        .prepare("SELECT transcript_updated_at AS value FROM session_windows WHERE session_id = ?")
        .get(SESSION_ID),
    ).toEqual({ value: 1_000_001 });
    const repairedManager = SessionManager.open(scope, state.workspaceDir);
    expect(repairedManager.getEntries().map((entry) => entry.id)).toEqual(["model-1", "user-1"]);
    expect(repairedManager.buildSessionContext().messages).toEqual([
      { role: "user", content: "Is all good?" },
    ]);
    expect(note).toHaveBeenCalledWith(
      "- Prepended current headers to 1 session transcript.",
      "Session transcript headers",
    );

    note.mockClear();
    const afterFirstRepair = readTranscriptStorageRows(database, SESSION_ID);
    await expect(
      noteSessionTranscriptHeaderHealth({ cfg, env: state.env, shouldRepair: true }),
    ).resolves.toEqual({ found: 0, repaired: 0 });
    expect(readTranscriptStorageRows(database, SESSION_ID)).toEqual(afterFirstRepair);
    expect(note).not.toHaveBeenCalled();
  });

  it("does not admit legacy headerless rows into the current runtime shape", async () => {
    await seedHeaderlessTranscript([
      { type: "message", message: { role: "user", content: "legacy message" } },
      { type: "message", message: { role: "hookMessage", content: "legacy hook" } },
    ]);
    const database = openMangabaClawAgentDatabase({ agentId: AGENT_ID, env: state.env });
    const before = readTranscriptStorageRows(database, SESSION_ID);

    await expect(
      noteSessionTranscriptHeaderHealth({ cfg, env: state.env, shouldRepair: true }),
    ).resolves.toEqual({ found: 0, repaired: 0 });

    expect(readTranscriptStorageRows(database, SESSION_ID)).toEqual(before);
    expect(() => SessionManager.open(scope, state.workspaceDir)).toThrow(
      "require doctor/import migration before runtime use",
    );
    expect(loadTranscriptEventsSync(scope)).toHaveLength(2);
    expect(note).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "a malformed current entry",
      events: [
        {
          type: "message",
          id: "malformed-message",
          parentId: null,
          timestamp: "2026-07-15T21:23:03.698Z",
          message: { role: "invalid", content: "not a current message" },
        },
      ],
    },
    {
      name: "an invalid leaf control",
      events: [
        {
          type: "message",
          id: "user-1",
          parentId: null,
          timestamp: "2026-07-15T21:23:03.698Z",
          message: { role: "user", content: "hello" },
        },
        {
          type: "leaf",
          id: "invalid-leaf",
          parentId: "user-1",
        },
      ],
    },
  ])("does not repair $name", async ({ events }) => {
    await seedHeaderlessTranscript(events);
    const database = openMangabaClawAgentDatabase({ agentId: AGENT_ID, env: state.env });
    const before = readTranscriptStorageRows(database, SESSION_ID);

    await expect(
      noteSessionTranscriptHeaderHealth({ cfg, env: state.env, shouldRepair: true }),
    ).resolves.toEqual({ found: 0, repaired: 0 });

    expect(readTranscriptStorageRows(database, SESSION_ID)).toEqual(before);
    expect(() => SessionManager.open(scope, state.workspaceDir)).toThrow(
      "require doctor/import migration before runtime use",
    );
    expect(note).not.toHaveBeenCalled();
  });

  it("does not repair duplicate event identities", async () => {
    await seedHeaderlessTranscript([
      {
        type: "message",
        id: "user-1",
        parentId: null,
        timestamp: "2026-07-15T21:23:03.698Z",
        message: { role: "user", content: "first" },
      },
      {
        type: "message",
        id: "user-2",
        parentId: "user-1",
        timestamp: "2026-07-15T21:23:03.699Z",
        message: { role: "user", content: "second" },
      },
    ]);
    const databaseOptions = { agentId: AGENT_ID, env: state.env };
    const database = openMangabaClawAgentDatabase(databaseOptions);
    runMangabaClawAgentWriteTransaction((transactionDatabase) => {
      const duplicate = {
        type: "message",
        id: "user-1",
        parentId: "user-1",
        timestamp: "2026-07-15T21:23:03.699Z",
        message: { role: "user", content: "second" },
      };
      transactionDatabase.db
        .prepare("UPDATE transcript_events SET event_json = ? WHERE session_id = ? AND seq = 1")
        .run(JSON.stringify(duplicate), SESSION_ID);
    }, databaseOptions);
    const before = readTranscriptStorageRows(database, SESSION_ID);

    await expect(
      noteSessionTranscriptHeaderHealth({ cfg, env: state.env, shouldRepair: true }),
    ).resolves.toEqual({ found: 0, repaired: 0 });

    expect(readTranscriptStorageRows(database, SESSION_ID)).toEqual(before);
    expect(note).not.toHaveBeenCalled();
  });

  it("uses the configured agent workspace when the session has no spawned cwd", async () => {
    await seedHeaderlessTranscript(
      [
        {
          type: "message",
          id: "user-1",
          parentId: null,
          timestamp: "2026-07-15T21:23:03.698Z",
          message: { role: "user", content: "hello" },
        },
      ],
      {},
    );

    await expect(
      noteSessionTranscriptHeaderHealth({ cfg, env: state.env, shouldRepair: true }),
    ).resolves.toEqual({ found: 1, repaired: 1 });

    const database = openMangabaClawAgentDatabase({ agentId: AGENT_ID, env: state.env });
    const header = JSON.parse(readTranscriptStorageRows(database, SESSION_ID)[0]!.eventJson);
    expect(header).toMatchObject({ type: "session", cwd: state.workspaceDir });
  });

  it("does not borrow the spawned cwd from a newer session on the same key", async () => {
    await seedHeaderlessTranscript([
      {
        type: "message",
        id: "user-1",
        parentId: null,
        timestamp: "2026-07-15T21:23:03.698Z",
        message: { role: "user", content: "hello" },
      },
    ]);
    const databaseOptions = { agentId: AGENT_ID, env: state.env };
    runMangabaClawAgentWriteTransaction((database) => {
      database.db
        .prepare(
          "UPDATE session_nodes SET current_session_id = ?, entry_json = ? WHERE session_key = ?",
        )
        .run(
          "newer-session",
          JSON.stringify({ sessionId: "newer-session", spawnedCwd: "/workspace/newer" }),
          SESSION_KEY,
        );
    }, databaseOptions);

    await expect(
      noteSessionTranscriptHeaderHealth({ cfg, env: state.env, shouldRepair: true }),
    ).resolves.toEqual({ found: 1, repaired: 1 });

    const database = openMangabaClawAgentDatabase(databaseOptions);
    const header = JSON.parse(readTranscriptStorageRows(database, SESSION_ID)[0]!.eventJson);
    expect(header).toMatchObject({ type: "session", cwd: state.workspaceDir });
  });
});
