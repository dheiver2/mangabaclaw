import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { onTestFinished } from "vitest";
import { replaceSessionEntrySync } from "../config/sessions/session-accessor.entry.js";
import { parseAgentSessionKey } from "../routing/session-key.js";
import {
  closeMangabaClawAgentDatabasesForTest,
  openMangabaClawAgentDatabase,
} from "../state/mangabaclaw-agent-db.js";
import { closeMangabaClawStateDatabaseForTest } from "../state/mangabaclaw-state-db.js";
import { SqliteBoardStore } from "./sqlite-board-store.js";

export function createTestBoardStore(options: { stateDir?: string } = {}): SqliteBoardStore {
  const ownsStateDir = options.stateDir === undefined;
  const stateDir = options.stateDir ?? mkdtempSync(path.join(tmpdir(), "mangabaclaw-board-store-"));
  const env = { MANGABACLAW_STATE_DIR: stateDir };
  const seededSessions = new Set<string>();

  if (ownsStateDir) {
    onTestFinished(() => {
      closeMangabaClawAgentDatabasesForTest();
      closeMangabaClawStateDatabaseForTest();
      rmSync(stateDir, { recursive: true, force: true });
    });
  }

  return new SqliteBoardStore({
    resolveSession: (sessionKey) => {
      const parsed = parseAgentSessionKey(sessionKey);
      const agentId = parsed?.agentId ?? "main";
      // Mirror the Gateway resolver so shorthand keys exercise canonical persisted rows.
      const canonicalSessionKey = parsed ? sessionKey : `agent:${agentId}:${sessionKey}`;
      const identity = `${agentId}\0${canonicalSessionKey}`;
      if (!seededSessions.has(identity)) {
        const database = openMangabaClawAgentDatabase({ agentId, env });
        replaceSessionEntrySync(
          { agentId, sessionKey: canonicalSessionKey, storePath: database.path },
          { sessionId: `board-test-${seededSessions.size}`, updatedAt: Date.now() },
        );
        seededSessions.add(identity);
      }
      return { agentId, sessionKey: canonicalSessionKey };
    },
    env,
  });
}
