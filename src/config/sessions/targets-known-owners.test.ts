import path from "node:path";
import { withTempHome } from "mangabaclaw/plugin-sdk/test-env";
import { describe, expect, it } from "vitest";
import { unregisterMangabaClawAgentDatabase } from "../../state/mangabaclaw-agent-db-registry.js";
import type { MangabaClawConfig } from "../config.js";
import { replaceSessionEntry } from "./session-accessor.js";
import { resolveSqliteTargetFromSessionStorePath } from "./session-sqlite-target.js";
import { listKnownSessionStoreAgentIds } from "./targets.js";

describe("known session store owners", () => {
  it("includes a retired owner registered under the active shared store", async () => {
    await withTempHome(async (home) => {
      const stateDir = path.join(home, ".mangabaclaw");
      const env = { ...process.env, MANGABACLAW_STATE_DIR: stateDir };
      const storePath = path.join(stateDir, "shared", "sessions.json");
      const cfg: MangabaClawConfig = {
        session: { store: storePath },
        agents: { entries: { ops: { default: true } } },
      };

      await replaceSessionEntry(
        {
          agentId: "retired",
          env,
          storePath,
          sessionKey: "agent:retired:cron:old:run:expired",
        },
        { sessionId: "retired-session", updatedAt: 1 },
      );

      expect(listKnownSessionStoreAgentIds(cfg, { env }).toSorted()).toEqual(["ops", "retired"]);
    });
  });

  it("keeps a retired fixed-store owner after its registry row is removed", async () => {
    await withTempHome(async (home) => {
      const stateDir = path.join(home, ".mangabaclaw");
      const env = { ...process.env, MANGABACLAW_STATE_DIR: stateDir };
      const storePath = path.join(stateDir, "shared", "sessions.json");
      const cfg: MangabaClawConfig = {
        session: { store: storePath },
        agents: { entries: { ops: { default: true } } },
      };

      await replaceSessionEntry(
        {
          agentId: "retired",
          defaultAgentId: "retired",
          env,
          storePath,
          sessionKey: "agent:retired:cron:old:run:expired",
        },
        { sessionId: "retired-session", updatedAt: 1 },
      );
      const retiredDatabasePath = resolveSqliteTargetFromSessionStorePath(storePath, {
        agentId: "retired",
        defaultAgentId: "retired",
        env,
      }).path;
      unregisterMangabaClawAgentDatabase({ agentId: "retired", env, path: retiredDatabasePath });

      expect(listKnownSessionStoreAgentIds(cfg, { env }).toSorted()).toEqual(["ops", "retired"]);
    });
  });

  it("finds a retired owner in a durable suffixed sibling without a registry row", async () => {
    await withTempHome(async (home) => {
      const stateDir = path.join(home, ".mangabaclaw");
      const env = { ...process.env, MANGABACLAW_STATE_DIR: stateDir };
      const storePath = path.join(stateDir, "shared", "sessions.json");
      const cfg: MangabaClawConfig = {
        session: { store: storePath },
        agents: { entries: { ops: { default: true } } },
      };

      await replaceSessionEntry(
        {
          agentId: "retired",
          defaultAgentId: "ops",
          env,
          storePath,
          sessionKey: "agent:retired:cron:old:run:suffixed",
        },
        { sessionId: "retired-suffixed-session", updatedAt: 1 },
      );
      const retiredDatabasePath = resolveSqliteTargetFromSessionStorePath(storePath, {
        agentId: "retired",
        defaultAgentId: "ops",
        env,
      }).path;
      expect(path.basename(retiredDatabasePath)).toBe("mangabaclaw-agent.retired.sqlite");
      unregisterMangabaClawAgentDatabase({ agentId: "retired", env, path: retiredDatabasePath });

      expect(listKnownSessionStoreAgentIds(cfg, { env }).toSorted()).toEqual(["ops", "retired"]);
    });
  });
});
