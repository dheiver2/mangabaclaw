// Test Support helper module supports debug proxy env test helpers behavior.
import { afterEach, vi } from "vitest";

const DEBUG_PROXY_ENV_KEYS = [
  "MANGABACLAW_DEBUG_PROXY_ENABLED",
  "MANGABACLAW_DEBUG_PROXY_SESSION_ID",
  "MANGABACLAW_STATE_DIR",
] as const;

type DebugProxyEnvKey = (typeof DEBUG_PROXY_ENV_KEYS)[number];
type DebugProxyEnvSnapshot = Partial<Record<DebugProxyEnvKey, string | undefined>>;

function snapshotDebugProxyEnv(): DebugProxyEnvSnapshot {
  return Object.fromEntries(
    DEBUG_PROXY_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as DebugProxyEnvSnapshot;
}

function restoreDebugProxyEnv(snapshot: DebugProxyEnvSnapshot): void {
  for (const key of DEBUG_PROXY_ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export function installDebugProxyTestResetHooks() {
  const originalFetch = globalThis.fetch;
  const originalProxyEnv = snapshotDebugProxyEnv();
  let priorProxyEnv = originalProxyEnv;

  afterEach(async () => {
    const { closeDebugProxyCaptureStore } = await import("mangabaclaw/plugin-sdk/proxy-capture");
    const { closeMangabaClawStateDatabaseForTest } =
      await import("mangabaclaw/plugin-sdk/sqlite-runtime-testing");
    closeDebugProxyCaptureStore();
    closeMangabaClawStateDatabaseForTest();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    restoreDebugProxyEnv(priorProxyEnv);
    priorProxyEnv = originalProxyEnv;
  });

  return {
    captureProxyEnv() {
      priorProxyEnv = snapshotDebugProxyEnv();
    },
    originalFetch,
  };
}
