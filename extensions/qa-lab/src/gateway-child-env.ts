// Qa Lab plugin module owns gateway child runtime environment behavior.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildQaCodexAppServerArgs } from "./codex-app-server-args.js";
import type { QaProviderMode } from "./model-selection.js";
import {
  normalizeQaProviderModeEnv,
  resolveQaLiveCliAuthEnv,
  type QaCliBackendAuthMode,
} from "./providers/env.js";
import { getQaProvider } from "./providers/index.js";
import {
  QA_LIVE_ANTHROPIC_SETUP_TOKEN_ENV,
  QA_LIVE_SETUP_TOKEN_VALUE_ENV,
} from "./providers/live-frontier/auth.js";
import { listMockCodexModelInfos } from "./providers/shared/mock-model-config.js";
import type { RuntimeId } from "./runtime-parity.js";

const QA_GATEWAY_CHILD_BLOCKED_ENV_VARS = Object.freeze([
  "BASH_ENV",
  "BASHOPTS",
  "ENV",
  "MANGABACLAW_QA_CONVEX_SECRET_CI",
  "MANGABACLAW_QA_CONVEX_SECRET_MAINTAINER",
  "MANGABACLAW_QA_SUT_FORBIDDEN_SENTINEL",
  "MANGABACLAW_QA_TELEGRAM_GROUP_ID",
  "MANGABACLAW_QA_TELEGRAM_DRIVER_BOT_TOKEN",
  "MANGABACLAW_QA_TELEGRAM_SUT_BOT_TOKEN",
  "SHELLOPTS",
]);

function scrubQaGatewayChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  for (const envKey of QA_GATEWAY_CHILD_BLOCKED_ENV_VARS) {
    delete env[envKey];
  }
  // Bash imports exported functions before the launcher can apply its allowlist.
  for (const envKey of Object.keys(env)) {
    if (envKey.startsWith("BASH_FUNC_")) {
      delete env[envKey];
    }
  }
  return env;
}

function scrubQaGatewayChildTestRunnerEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // The Gateway is a product child, not a nested Vitest worker. Leaking runner
  // markers makes the dist launcher select test-only startup behavior.
  delete env.VITEST;
  delete env.VITEST_POOL_ID;
  delete env.VITEST_WORKER_ID;
  if (env.NODE_ENV === "test") {
    delete env.NODE_ENV;
  }
  return env;
}

export function buildQaRuntimeEnv(params: {
  configPath: string;
  gatewayToken: string;
  homeDir: string;
  forwardHostHome?: boolean;
  stateDir: string;
  tempRoot: string;
  xdgConfigHome: string;
  xdgDataHome: string;
  xdgCacheHome: string;
  bundledPluginsDir?: string;
  stagedBundledPluginsRoot?: string | null;
  compatibilityHostVersion?: string;
  providerMode?: QaProviderMode;
  baseEnv?: NodeJS.ProcessEnv;
  runtimeEnvPatch?: NodeJS.ProcessEnv;
  forwardHostHomeForClaudeCli?: boolean;
  claudeCliAuthMode?: QaCliBackendAuthMode;
}) {
  const baseEnv = params.baseEnv ?? process.env;
  const provider = params.providerMode ? getQaProvider(params.providerMode) : null;
  const forwardedHostHome = params.forwardHostHome
    ? baseEnv.HOME?.trim() || os.homedir()
    : undefined;
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    HOME: forwardedHostHome ?? params.homeDir,
    ...(provider?.appliesLiveEnvAliases
      ? resolveQaLiveCliAuthEnv(baseEnv, {
          forwardHostHomeForClaudeCli: params.forwardHostHomeForClaudeCli,
          claudeCliAuthMode: params.claudeCliAuthMode,
        })
      : {}),
    MANGABACLAW_HOME: params.homeDir,
    MANGABACLAW_CONFIG_PATH: params.configPath,
    MANGABACLAW_STATE_DIR: params.stateDir,
    MANGABACLAW_OAUTH_DIR: path.join(params.stateDir, "credentials"),
    MANGABACLAW_GATEWAY_TOKEN: params.gatewayToken,
    MANGABACLAW_SKIP_BROWSER_CONTROL_SERVER: "1",
    MANGABACLAW_SKIP_GMAIL_WATCHER: "1",
    MANGABACLAW_SKIP_CANVAS_HOST: "1",
    MANGABACLAW_SKIP_STARTUP_MODEL_PREWARM: "1",
    MANGABACLAW_NO_RESPAWN: "1",
    MANGABACLAW_TEST_FAST: "1",
    MANGABACLAW_EMBEDDED_ABORT_SETTLE_TIMEOUT_MS: "2000",
    MANGABACLAW_QA_PARENT_PID: String(process.pid),
    MANGABACLAW_QA_TEMP_ROOT: params.tempRoot,
    ...(params.stagedBundledPluginsRoot
      ? { MANGABACLAW_QA_STAGED_RUNTIME_ROOT: params.stagedBundledPluginsRoot }
      : {}),
    MANGABACLAW_QA_ALLOW_LOCAL_IMAGE_PROVIDER: "1",
    // QA uses the fast runtime envelope for speed, but it still exercises
    // normal config-driven heartbeats and runtime config writes.
    MANGABACLAW_ALLOW_SLOW_REPLY_TESTS: "1",
    XDG_CONFIG_HOME: params.xdgConfigHome,
    XDG_DATA_HOME: params.xdgDataHome,
    XDG_CACHE_HOME: params.xdgCacheHome,
    ...(params.bundledPluginsDir ? { MANGABACLAW_BUNDLED_PLUGINS_DIR: params.bundledPluginsDir } : {}),
    ...(params.compatibilityHostVersion
      ? { MANGABACLAW_COMPATIBILITY_HOST_VERSION: params.compatibilityHostVersion }
      : {}),
  };
  const normalizedEnv = normalizeQaProviderModeEnv(env, params.providerMode);
  // Test-runner skip flags are parent controls; each QA child declares its own runtime needs.
  delete normalizedEnv.MANGABACLAW_SKIP_CHANNELS;
  delete normalizedEnv.MANGABACLAW_SKIP_PROVIDERS;
  Object.assign(normalizedEnv, params.runtimeEnvPatch);
  // Parent shell startup controls must be removed after caller patches so no
  // launcher or runtime child can import them before its own allowlist runs.
  normalizedEnv.MANGABACLAW_BUILD_PRIVATE_QA = "1";
  delete normalizedEnv[QA_LIVE_ANTHROPIC_SETUP_TOKEN_ENV];
  delete normalizedEnv[QA_LIVE_SETUP_TOKEN_VALUE_ENV];
  return scrubQaGatewayChildEnv(scrubQaGatewayChildTestRunnerEnv(normalizedEnv));
}

export async function stageQaCodexMockModelCatalog(params: {
  tempRoot: string;
  forcedRuntime?: RuntimeId;
  providerMode: QaProviderMode;
  primaryModel?: string;
  alternateModel?: string;
}): Promise<string | undefined> {
  if (params.forcedRuntime !== "codex" || params.providerMode !== "mock-openai") {
    return undefined;
  }
  const modelCatalogPath = path.join(params.tempRoot, "codex-model-catalog.json");
  const selectedModelRefs = [params.primaryModel, params.alternateModel].filter(
    (model): model is string => typeof model === "string" && model.length > 0,
  );
  await fs.writeFile(
    modelCatalogPath,
    `${JSON.stringify({ models: listMockCodexModelInfos(selectedModelRefs) }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  return modelCatalogPath;
}

export function buildQaForcedRuntimeEnvPatch(params: {
  forcedRuntime?: RuntimeId;
  providerMode: QaProviderMode;
  providerBaseUrl?: string;
  codexModelCatalogPath?: string;
  nativeAppServerArgs?: string;
}): NodeJS.ProcessEnv | undefined {
  if (!params.forcedRuntime) {
    return undefined;
  }
  const patch: NodeJS.ProcessEnv = {
    MANGABACLAW_BUILD_PRIVATE_QA: "1",
    MANGABACLAW_QA_FORCE_RUNTIME: params.forcedRuntime,
  };
  if (params.forcedRuntime !== "codex") {
    return patch;
  }
  if (params.providerMode !== "mock-openai") {
    patch.MANGABACLAW_CODEX_APP_SERVER_ARGS = buildQaCodexAppServerArgs({
      existingArgs: params.nativeAppServerArgs,
    });
    return patch;
  }
  const providerBaseUrl = params.providerBaseUrl?.trim().replace(/\/+$/u, "");
  if (!providerBaseUrl) {
    throw new Error("forced Codex mock QA requires the managed mock provider URL");
  }
  if (!params.codexModelCatalogPath) {
    throw new Error("forced Codex mock QA requires the staged native model catalog");
  }
  patch.MANGABACLAW_CODEX_APP_SERVER_ARGS = buildQaCodexAppServerArgs({
    providerBaseUrl,
    modelCatalogPath: params.codexModelCatalogPath,
  });
  return patch;
}
