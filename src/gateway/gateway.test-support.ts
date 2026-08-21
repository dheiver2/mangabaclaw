import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clearConfigCache, clearRuntimeConfigSnapshot } from "../config/config.js";
import { resetConfigOverrides } from "../config/runtime-overrides.js";
import { clearSessionStoreCacheForTest } from "../config/sessions/store-writer-state.js";
import { resetAgentEventsForTest } from "../infra/agent-events.js";
import { captureEnv, deleteTestEnvValue, setTestEnvValue } from "../test-utils/env.js";
import { GATEWAY_STARTUP_MUTATED_ENV_KEYS } from "./test-helpers.env.js";

let gatewayTestSeq = 0;

export const GATEWAY_TEST_ENV_KEYS = [
  "HOME",
  ...GATEWAY_STARTUP_MUTATED_ENV_KEYS,
  "MANGABACLAW_STATE_DIR",
  "MANGABACLAW_CONFIG_PATH",
  "MANGABACLAW_GATEWAY_TOKEN",
  "MANGABACLAW_TEST_GATEWAY_OVERRIDE_TOKEN",
  "MANGABACLAW_TEST_RUNTIME_OVERRIDE_TOKEN",
  "MANGABACLAW_SKIP_CHANNELS",
  "MANGABACLAW_SKIP_GMAIL_WATCHER",
  "MANGABACLAW_SKIP_CRON",
  "MANGABACLAW_SKIP_CANVAS_HOST",
  "MANGABACLAW_SKIP_BROWSER_CONTROL_SERVER",
  "MANGABACLAW_SKIP_PROVIDERS",
  "MANGABACLAW_BUNDLED_PLUGINS_DIR",
  "MANGABACLAW_DISABLE_BUNDLED_PLUGINS",
] as const;

export function nextGatewayId(prefix: string): string {
  return `${prefix}-${process.pid}-${process.env.VITEST_POOL_ID ?? "0"}-${gatewayTestSeq++}`;
}

async function createEmptyBundledPluginsDir(tempHome: string): Promise<string> {
  const bundledPluginsDir = path.join(tempHome, "mangabaclaw-test-empty-bundled-plugins");
  await fs.mkdir(bundledPluginsDir, { recursive: true });
  return bundledPluginsDir;
}

export async function createGatewayConfigPath(tempHome: string): Promise<string> {
  const configPath = path.join(tempHome, ".mangabaclaw", "mangabaclaw.json");
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  return configPath;
}

export async function removeGatewayTempHome(tempHome: string): Promise<void> {
  await fs.rm(tempHome, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 50,
  });
}

export async function setupGatewayTempHome(params: { prefix: string; minimalGateway?: boolean }) {
  const envSnapshot = captureEnv([
    ...GATEWAY_TEST_ENV_KEYS,
    ...(params.minimalGateway ? (["MANGABACLAW_TEST_MINIMAL_GATEWAY"] as const) : []),
  ]);

  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), params.prefix));
  setTestEnvValue("HOME", tempHome);
  setTestEnvValue("MANGABACLAW_STATE_DIR", path.join(tempHome, ".mangabaclaw"));
  deleteTestEnvValue("MANGABACLAW_CONFIG_PATH");
  setTestEnvValue("MANGABACLAW_SKIP_CHANNELS", "1");
  setTestEnvValue("MANGABACLAW_SKIP_GMAIL_WATCHER", "1");
  setTestEnvValue("MANGABACLAW_SKIP_CRON", "1");
  setTestEnvValue("MANGABACLAW_SKIP_CANVAS_HOST", "1");
  setTestEnvValue("MANGABACLAW_SKIP_BROWSER_CONTROL_SERVER", "1");
  setTestEnvValue("MANGABACLAW_SKIP_PROVIDERS", "1");
  if (params.minimalGateway) {
    setTestEnvValue("MANGABACLAW_TEST_MINIMAL_GATEWAY", "1");
  } else {
    deleteTestEnvValue("MANGABACLAW_TEST_MINIMAL_GATEWAY");
  }

  const workspaceDir = path.join(tempHome, "mangabaclaw");
  await fs.mkdir(workspaceDir, { recursive: true });
  setTestEnvValue("MANGABACLAW_BUNDLED_PLUGINS_DIR", await createEmptyBundledPluginsDir(tempHome));
  setTestEnvValue("MANGABACLAW_DISABLE_BUNDLED_PLUGINS", "1");
  return { envSnapshot, tempHome, workspaceDir };
}

export function resetGatewayTestState(): void {
  resetConfigOverrides();
  clearRuntimeConfigSnapshot();
  clearConfigCache();
  clearSessionStoreCacheForTest();
  resetAgentEventsForTest({ preserveListeners: true });
}
