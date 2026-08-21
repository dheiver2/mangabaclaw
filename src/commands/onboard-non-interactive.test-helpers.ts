import fs from "node:fs/promises";
import path from "node:path";
import { expect, vi } from "vitest";
import { listAgentEntries } from "../agents/agent-scope-config.js";
import type { ConfigFileSnapshot, MangabaClawConfig } from "../config/types.mangabaclaw.js";
// Non-interactive onboarding test helpers build runtime stubs that throw instead of exiting.
import type { RuntimeEnv } from "../runtime.js";
import { captureEnv, deleteTestEnvValue, setTestEnvValue } from "../test-utils/env.js";

type RuntimeLike = Pick<RuntimeEnv, "log" | "error" | "exit">;

type NonInteractiveRuntime = {
  log: RuntimeLike["log"];
  error: RuntimeLike["error"];
  exit: RuntimeLike["exit"];
};

export type WaitForGatewayReachableMock =
  | ((params: {
      url: string;
      token?: string;
      password?: string;
      deadlineMs?: number;
      probeTimeoutMs?: number;
    }) => Promise<{ ok: boolean; detail?: string }>)
  | undefined;

type RunNonInteractiveSetup = typeof import("./onboard-non-interactive.js").runNonInteractiveSetup;

type MockWithCalls<TArgs extends unknown[]> = {
  mock: {
    calls: TArgs[];
  };
};

export type OnboardEnsureWorkspaceOptions = {
  skipBootstrap?: boolean;
};

export type OnboardGatewayHealthCall = {
  password?: string;
  token?: string;
};

export type OnboardHealthCommandCall = OnboardGatewayHealthCall & {
  config?: MangabaClawConfig;
};

export function createThrowingRuntime(): NonInteractiveRuntime {
  return {
    log: () => {},
    error: (...args: unknown[]) => {
      throw new Error(args.map(String).join(" "));
    },
    exit: (code: number) => {
      throw new Error(`exit:${code}`);
    },
  };
}

export function createOnboardJsonCaptureRuntime() {
  let capturedJson = "";
  const runtimeWithCapture: RuntimeEnv = {
    log: (...args: unknown[]) => {
      const firstArg = args[0];
      capturedJson =
        typeof firstArg === "string"
          ? firstArg
          : firstArg instanceof Error
            ? firstArg.message
            : (JSON.stringify(firstArg) ?? "");
    },
    error: (...args: unknown[]) => {
      const firstArg = args[0];
      const capturedError =
        typeof firstArg === "string"
          ? firstArg
          : firstArg instanceof Error
            ? firstArg.message
            : (JSON.stringify(firstArg) ?? "");
      throw new Error(capturedError);
    },
    exit: (_code: number) => {
      throw new Error("exit should not be reached after runtime.error");
    },
  };

  return {
    runtimeWithCapture,
    readCapturedJson: () => capturedJson,
  };
}

export function readOnboardFirstMockCall(mock: unknown, label: string): unknown[] {
  const calls = (mock as MockWithCalls<unknown[]>).mock.calls;
  const call = calls[0];
  if (!call) {
    throw new Error(`Expected ${label} to be called`);
  }
  return call;
}

export function createOnboardTestConfigStore() {
  const configStore = new Map<string, MangabaClawConfig>();

  function resolveConfigPath() {
    const override = process.env.MANGABACLAW_CONFIG_PATH?.trim();
    if (override) {
      return override;
    }
    const stateDir = process.env.MANGABACLAW_STATE_DIR?.trim();
    if (!stateDir) {
      throw new Error("MANGABACLAW_STATE_DIR must be set before config IO in this test");
    }
    return path.join(stateDir, "mangabaclaw.json");
  }

  function readConfig(): MangabaClawConfig {
    return configStore.get(resolveConfigPath()) ?? {};
  }

  function readSnapshot(): ConfigFileSnapshot {
    const config = configStore.get(resolveConfigPath()) ?? {};
    const exists = configStore.has(resolveConfigPath());
    return {
      path: resolveConfigPath(),
      exists,
      raw: exists ? `${JSON.stringify(config, null, 2)}\n` : null,
      parsed: config,
      sourceConfig: config,
      resolved: config,
      valid: true,
      runtimeConfig: config,
      config,
      ...(exists ? { hash: "test-config-hash" } : {}),
      issues: [],
      warnings: [],
      legacyIssues: [],
    };
  }

  return { configStore, resolveConfigPath, readConfig, readSnapshot };
}

export function createOnboardStateDirHarness(getTempHome: () => string | undefined) {
  async function withStateDir(
    prefix: string,
    run: (stateDir: string) => Promise<void>,
  ): Promise<void> {
    const tempHome = getTempHome();
    if (!tempHome) {
      throw new Error("temp home not initialized");
    }
    const stateDir = await fs.realpath(await fs.mkdtemp(path.join(tempHome, prefix)));
    setTestEnvValue("MANGABACLAW_STATE_DIR", stateDir);
    deleteTestEnvValue("MANGABACLAW_CONFIG_PATH");
    try {
      await run(stateDir);
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true });
    }
  }

  return { withStateDir };
}

export function prepareOnboardGatewayTestEnv() {
  const snapshot = captureEnv([
    "HOME",
    "MANGABACLAW_STATE_DIR",
    "MANGABACLAW_CONFIG_PATH",
    "MANGABACLAW_SKIP_CHANNELS",
    "MANGABACLAW_SKIP_GMAIL_WATCHER",
    "MANGABACLAW_SKIP_CRON",
    "MANGABACLAW_SKIP_CANVAS_HOST",
    "MANGABACLAW_SKIP_BROWSER_CONTROL_SERVER",
    "MANGABACLAW_GATEWAY_TOKEN",
    "MANGABACLAW_GATEWAY_PASSWORD",
  ]);
  setTestEnvValue("MANGABACLAW_SKIP_CHANNELS", "1");
  setTestEnvValue("MANGABACLAW_SKIP_GMAIL_WATCHER", "1");
  setTestEnvValue("MANGABACLAW_SKIP_CRON", "1");
  setTestEnvValue("MANGABACLAW_SKIP_CANVAS_HOST", "1");
  setTestEnvValue("MANGABACLAW_SKIP_BROWSER_CONTROL_SERVER", "1");
  deleteTestEnvValue("MANGABACLAW_GATEWAY_TOKEN");
  deleteTestEnvValue("MANGABACLAW_GATEWAY_PASSWORD");
  return snapshot;
}

export function createOnboardLocalDaemonOptions(stateDir: string) {
  return {
    nonInteractive: true,
    mode: "local" as const,
    workspace: path.join(stateDir, "mangabaclaw"),
    authChoice: "skip" as const,
    skipSkills: true,
    skipHealth: false,
    installDaemon: true,
    gatewayBind: "loopback" as const,
  };
}

export async function runOnboardLocalDaemonSetup(params: {
  runSetup: RunNonInteractiveSetup;
  stateDir: string;
  runtime: RuntimeEnv;
}) {
  await params.runSetup(createOnboardLocalDaemonOptions(params.stateDir), params.runtime);
}

export async function expectOnboardLocalJsonSetupFailure(params: {
  runSetup: RunNonInteractiveSetup;
  stateDir: string;
  runtime: RuntimeEnv;
}) {
  await expect(
    params.runSetup(
      {
        ...createOnboardLocalDaemonOptions(params.stateDir),
        json: true,
      },
      params.runtime,
    ),
  ).rejects.toThrow("exit should not be reached after runtime.error");
}

export function createOnboardGatewayTimeoutCapture() {
  let capturedDeadlineMs: number | undefined;
  let capturedProbeTimeoutMs: number | undefined;
  const mock = vi.fn(
    async (params: {
      url: string;
      token?: string;
      password?: string;
      deadlineMs?: number;
      probeTimeoutMs?: number;
    }) => {
      capturedDeadlineMs = params.deadlineMs;
      capturedProbeTimeoutMs = params.probeTimeoutMs;
      return { ok: true };
    },
  );
  return {
    mock,
    get deadlineMs() {
      return capturedDeadlineMs;
    },
    get probeTimeoutMs() {
      return capturedProbeTimeoutMs;
    },
  };
}

export async function mockOnboardingAgent(params: { config: MangabaClawConfig; workspace: string }) {
  const roster = listAgentEntries(params.config);
  const existing = roster.find((entry) => entry.default === true) ?? roster[0];
  if (existing) {
    return {
      config: params.config,
      agentId: existing.id,
      bootstrapPending: false,
    };
  }
  return {
    config: {
      ...params.config,
      agents: {
        ...params.config.agents,
        entries: { main: { name: "main", workspace: params.workspace, default: true } },
      },
    },
    agentId: "main",
    bootstrapPending: true,
  };
}
