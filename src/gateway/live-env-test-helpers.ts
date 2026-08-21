/**
 * Environment snapshot helpers for live gateway tests.
 */
import { deleteTestEnvValue, setTestEnvValue } from "../test-utils/env.js";
import { GATEWAY_STARTUP_MUTATED_ENV_KEYS } from "./test-helpers.env.js";

const COMMON_LIVE_ENV_NAMES = [
  ...GATEWAY_STARTUP_MUTATED_ENV_KEYS,
  "MANGABACLAW_AGENT_RUNTIME",
  "MANGABACLAW_CONFIG_PATH",
  "MANGABACLAW_GATEWAY_TOKEN",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "MANGABACLAW_SKIP_BROWSER_CONTROL_SERVER",
  "MANGABACLAW_SKIP_CANVAS_HOST",
  "MANGABACLAW_SKIP_CHANNELS",
  "MANGABACLAW_SKIP_CRON",
  "MANGABACLAW_SKIP_GMAIL_WATCHER",
  "MANGABACLAW_STATE_DIR",
] as const;

export type LiveEnvSnapshot = Record<string, string | undefined>;

/** Captures live-test environment variables so tests can restore them later. */
export function snapshotLiveEnv(extraNames: readonly string[] = []): LiveEnvSnapshot {
  const snapshot: LiveEnvSnapshot = {};
  for (const name of [...COMMON_LIVE_ENV_NAMES, ...extraNames]) {
    snapshot[name] = process.env[name];
  }
  return snapshot;
}

/** Restores a previously captured live-test environment snapshot. */
export function restoreLiveEnv(snapshot: LiveEnvSnapshot): void {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      deleteTestEnvValue(name);
    } else {
      setTestEnvValue(name, value);
    }
  }
}
