import fs from "node:fs";
import path from "node:path";
import { afterEach } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { closeMangabaClawStateDatabaseForTest } from "../state/mangabaclaw-state-db.js";
import { captureEnv, setTestEnvValue } from "../test-utils/env.js";
import {
  detectLegacyWorkspaceState,
  migrateLegacyWorkspaceState,
} from "./state-migrations.workspace-setup.js";

export function useWorkspaceMigrationTestFixture() {
  let envSnapshot: ReturnType<typeof captureEnv> | undefined;
  const tempDirs = useAutoCleanupTempDirTracker((cleanup) => {
    afterEach(() => {
      closeMangabaClawStateDatabaseForTest();
      envSnapshot?.restore();
      envSnapshot = undefined;
      cleanup();
    });
  });

  function setup() {
    const homeDir = tempDirs.make("mangabaclaw-workspace-migration-home-");
    const stateDir = path.join(homeDir, ".mangabaclaw");
    const workspaceDir = path.join(homeDir, "workspace");
    fs.mkdirSync(workspaceDir, { recursive: true });
    envSnapshot ??= captureEnv(["HOME", "MANGABACLAW_HOME", "MANGABACLAW_STATE_DIR"]);
    setTestEnvValue("HOME", homeDir);
    setTestEnvValue("MANGABACLAW_STATE_DIR", stateDir);
    const cfg = {
      agents: { defaults: { workspace: workspaceDir } },
    } satisfies MangabaClawConfig;
    return {
      cfg,
      env: { ...process.env, HOME: homeDir, MANGABACLAW_STATE_DIR: stateDir },
      homeDir,
      stateDir,
      workspaceDir,
    };
  }

  function detect(context: ReturnType<typeof setup>) {
    return detectLegacyWorkspaceState({
      cfg: context.cfg,
      stateDir: context.stateDir,
      env: context.env,
      homedir: () => context.homeDir,
      doctorOnlyStateMigrations: true,
    });
  }

  async function migrate(context: ReturnType<typeof setup>) {
    return await migrateLegacyWorkspaceState({
      detected: detect(context),
      env: context.env,
      stateDir: context.stateDir,
    });
  }

  return { detect, migrate, setup };
}
