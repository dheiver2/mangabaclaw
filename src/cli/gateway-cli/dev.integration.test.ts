// Proves a fresh dev gateway can replace the synthetic implicit roster through real config IO.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resetConfigRuntimeState } from "../../config/config.js";
import { withEnvAsync } from "../../test-utils/env.js";
import { ensureDevGatewayConfig } from "./dev.js";

describe("ensureDevGatewayConfig integration", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    resetConfigRuntimeState();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("writes the dedicated dev roster into a fresh state directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mangabaclaw-dev-config-integration-"));
    tempDirs.push(root);
    const stateDir = path.join(root, "state");
    const configPath = path.join(stateDir, "mangabaclaw.json");
    const workspace = path.join(root, "workspace");

    await withEnvAsync(
      {
        MANGABACLAW_CONFIG_PATH: configPath,
        MANGABACLAW_STATE_DIR: stateDir,
        MANGABACLAW_WORKSPACE_DIR: workspace,
      },
      async () => {
        resetConfigRuntimeState();
        await ensureDevGatewayConfig({});
      },
    );

    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      agents?: { entries?: Record<string, { default?: boolean; workspace?: string }> };
    };
    expect(config.agents?.entries).toEqual({
      dev: { default: true, workspace: `${workspace}-dev`, identity: expect.any(Object) },
    });
  });
});
