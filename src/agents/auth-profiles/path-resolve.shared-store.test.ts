import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../test/helpers/temp-dir.js";
import { writeConfigMachineState } from "../../state/config-machine-state.js";
import { closeMangabaClawStateDatabaseForTest } from "../../state/mangabaclaw-state-db.js";
import { resolveMangabaClawStateSqlitePath } from "../../state/mangabaclaw-state-db.paths.js";
import { withEnv } from "../../test-utils/env.js";
import { resolveAuthStatePathForDisplay, resolveAuthStorePathForDisplay } from "./paths.js";
import {
  clearRuntimeAuthProfileStoreSnapshots,
  setRuntimeAuthProfileStoreSnapshot,
} from "./runtime-snapshots.js";
import { hasLocalAuthProfileStoreSource } from "./source-check.js";
import {
  inspectPersistedAuthProfileStoreRaw,
  writePersistedAuthProfileStoreRaw,
} from "./sqlite.js";
import type { AuthProfileStore } from "./types.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);
const persistedStore = {
  version: 1,
  profiles: {
    "openai:test": { type: "api_key", provider: "openai", key: "test-key" },
  },
} satisfies AuthProfileStore;

function makeStateEnv(): NodeJS.ProcessEnv {
  const stateDir = tempDirs.make("mangabaclaw-shared-auth-store-");
  return { ...process.env, MANGABACLAW_STATE_DIR: stateDir, MANGABACLAW_AGENT_DIR: undefined };
}

describe("shared auth store path resolution", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    clearRuntimeAuthProfileStoreSnapshots();
    closeMangabaClawStateDatabaseForTest();
  });

  it("keeps the absent ownership record pinned to the shipped legacy-main path", async () => {
    const env = makeStateEnv();
    const { resolveSharedAuthStorePath } = await import("./path-resolve.js");
    const { resolveSharedMainAuthAgentDir } = await import("./shared-main-dir.js");
    const legacyDir = resolveSharedMainAuthAgentDir(env);

    expect(resolveSharedAuthStorePath(env)).toBe(path.join(legacyDir, "mangabaclaw-agent.sqlite"));

    writeConfigMachineState("auth.sharedStore", { location: "state-db" }, { env });
    const aliasEnv = {
      ...env,
      MANGABACLAW_STATE_DIR: path.join(env.MANGABACLAW_STATE_DIR ?? "", "."),
    };

    expect(resolveSharedAuthStorePath(aliasEnv)).toBe(
      path.join(legacyDir, "mangabaclaw-agent.sqlite"),
    );

    withEnv({ MANGABACLAW_STATE_DIR: env.MANGABACLAW_STATE_DIR, MANGABACLAW_AGENT_DIR: undefined }, () => {
      writePersistedAuthProfileStoreRaw(persistedStore, legacyDir);
      const expectedPath = path.join(legacyDir, "mangabaclaw-agent.sqlite");
      expect(resolveAuthStorePathForDisplay(legacyDir)).toBe(expectedPath);
      expect(resolveAuthStatePathForDisplay(legacyDir)).toBe(expectedPath);
      expect(inspectPersistedAuthProfileStoreRaw(legacyDir)).toMatchObject({
        status: "readable",
        raw: persistedStore,
      });
      expect(existsSync(expectedPath)).toBe(true);
    });
  });

  it("resolves the relocated store to the canonical shared state database", async () => {
    const env = makeStateEnv();
    writeConfigMachineState("auth.sharedStore", { location: "state-db" }, { env });
    const { resolveSharedAuthStoreOwnership, resolveSharedAuthStorePath } =
      await import("./path-resolve.js");

    expect(resolveSharedAuthStoreOwnership(env)).toEqual({ location: "state-db" });
    expect(resolveSharedAuthStorePath(env)).toBe(resolveMangabaClawStateSqlitePath(env));

    withEnv({ MANGABACLAW_STATE_DIR: env.MANGABACLAW_STATE_DIR, MANGABACLAW_AGENT_DIR: undefined }, () => {
      writePersistedAuthProfileStoreRaw(persistedStore);
      const agentDir = path.join(env.MANGABACLAW_STATE_DIR ?? "", "agents", "helper", "agent");
      const expectedPath = resolveMangabaClawStateSqlitePath(env);
      expect(resolveAuthStorePathForDisplay(agentDir)).toBe(expectedPath);
      expect(resolveAuthStatePathForDisplay(agentDir)).toBe(expectedPath);
      expect(existsSync(expectedPath)).toBe(true);
    });
  });

  it("keeps an agent-local store local under shared-state ownership", async () => {
    const env = makeStateEnv();
    writeConfigMachineState("auth.sharedStore", { location: "state-db" }, { env });
    const agentDir = path.join(env.MANGABACLAW_STATE_DIR ?? "", "agents", "helper", "agent");

    withEnv({ MANGABACLAW_STATE_DIR: env.MANGABACLAW_STATE_DIR, MANGABACLAW_AGENT_DIR: undefined }, () => {
      writePersistedAuthProfileStoreRaw(persistedStore, agentDir);
      const expectedPath = path.join(agentDir, "mangabaclaw-agent.sqlite");
      expect(resolveAuthStorePathForDisplay(agentDir)).toBe(expectedPath);
      expect(resolveAuthStatePathForDisplay(agentDir)).toBe(expectedPath);
      expect(existsSync(expectedPath)).toBe(true);
    });
  });

  it("ignores runtime-only external CLI profiles when displaying store ownership", async () => {
    const env = makeStateEnv();
    writeConfigMachineState("auth.sharedStore", { location: "state-db" }, { env });
    const agentDir = path.join(env.MANGABACLAW_STATE_DIR ?? "", "agents", "helper", "agent");

    withEnv({ MANGABACLAW_STATE_DIR: env.MANGABACLAW_STATE_DIR, MANGABACLAW_AGENT_DIR: undefined }, () => {
      writePersistedAuthProfileStoreRaw(persistedStore);
      setRuntimeAuthProfileStoreSnapshot(
        {
          ...persistedStore,
          runtimeExternalProfileIds: ["openai:test"],
          runtimeExternalCliProfileIds: ["openai:test"],
        },
        agentDir,
      );

      expect(hasLocalAuthProfileStoreSource(agentDir)).toBe(true);
      expect(inspectPersistedAuthProfileStoreRaw(agentDir).status).toBe("missing");
      expect(resolveAuthStorePathForDisplay(agentDir)).toBe(resolveMangabaClawStateSqlitePath(env));
      expect(resolveAuthStatePathForDisplay(agentDir)).toBe(resolveMangabaClawStateSqlitePath(env));
    });
  });

  it("caches ownership independently for each canonical state root", async () => {
    const firstEnv = makeStateEnv();
    const secondEnv = makeStateEnv();
    const { resolveSharedAuthStoreOwnership } = await import("./path-resolve.js");
    expect(resolveSharedAuthStoreOwnership(firstEnv)).toEqual({ location: "legacy-main" });

    writeConfigMachineState(
      "auth.sharedStore",
      { location: "legacy-main", extra: true },
      { env: secondEnv },
    );

    expect(() => resolveSharedAuthStoreOwnership(secondEnv)).toThrow(
      expect.objectContaining({
        name: "InvalidSharedAuthStoreOwnershipError",
        code: "INVALID_SHARED_AUTH_STORE_OWNERSHIP",
        action: "mangabaclaw doctor --fix",
      }),
    );
    expect(resolveSharedAuthStoreOwnership(firstEnv)).toEqual({ location: "legacy-main" });
  });
});
