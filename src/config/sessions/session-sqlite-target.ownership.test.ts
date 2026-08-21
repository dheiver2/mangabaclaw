import path from "node:path";
import { withTempHome } from "mangabaclaw/plugin-sdk/test-env";
import { describe, expect, it } from "vitest";
import { unregisterMangabaClawAgentDatabase } from "../../state/mangabaclaw-agent-db-registry.js";
import { openMangabaClawAgentDatabase } from "../../state/mangabaclaw-agent-db.js";
import { loadSessionEntry, replaceSessionEntry } from "./session-accessor.js";
import { resolveSqliteTargetFromSessionStorePath } from "./session-sqlite-target.js";

describe("explicit SQLite session target ownership", () => {
  it("keeps scoped rows for multiple agents in one exact SQLite locator", async () => {
    await withTempHome(async (home) => {
      const env = { ...process.env, MANGABACLAW_STATE_DIR: path.join(home, ".mangabaclaw") };
      const storePath = path.join(home, "shared.sqlite");
      const mainScope = {
        agentId: "main",
        defaultAgentId: "main",
        env,
        sessionKey: "agent:main:main",
        storePath,
      };
      const opsScope = {
        agentId: "ops",
        defaultAgentId: "main",
        env,
        sessionKey: "agent:ops:main",
        storePath,
      };

      const now = Date.now();
      await replaceSessionEntry(mainScope, { sessionId: "main-session", updatedAt: now });
      await replaceSessionEntry(opsScope, { sessionId: "ops-session", updatedAt: now + 1 });

      expect(loadSessionEntry(mainScope)).toMatchObject({ sessionId: "main-session" });
      expect(loadSessionEntry(opsScope)).toMatchObject({ sessionId: "ops-session" });
    });
  });

  it("honors durable ownership after the registry row is removed", async () => {
    await withTempHome(async (home) => {
      const stateDir = path.join(home, ".mangabaclaw");
      const env = { ...process.env, MANGABACLAW_STATE_DIR: stateDir };
      const databasePath = path.join(home, "shared.sqlite");
      openMangabaClawAgentDatabase({ agentId: "ops", env, path: databasePath });
      unregisterMangabaClawAgentDatabase({ agentId: "ops", env, path: databasePath });

      expect(resolveSqliteTargetFromSessionStorePath(databasePath, { env })).toMatchObject({
        agentId: "ops",
        ownerSource: "database-path",
        path: databasePath,
      });
    });
  });
});
