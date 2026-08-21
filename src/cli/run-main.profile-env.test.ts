// Run-main profile env tests cover profile environment handling in the CLI entrypoint.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureEnv, deleteTestEnvValue, setTestEnvValue } from "../test-utils/env.js";

const fileState = vi.hoisted(() => ({
  hasCliDotEnv: false,
}));

const dotenvState = vi.hoisted(() => {
  const state = {
    profileAtDotenvLoad: undefined as string | undefined,
    containerAtDotenvLoad: undefined as string | undefined,
  };
  return {
    state,
    loadDotEnv: vi.fn(() => {
      state.profileAtDotenvLoad = process.env.MANGABACLAW_PROFILE;
      state.containerAtDotenvLoad = process.env.MANGABACLAW_CONTAINER;
    }),
  };
});

const maybeRunCliInContainerMock = vi.hoisted(() =>
  vi.fn((argv: string[]) => ({ handled: false, argv })),
);

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  type ExistsSyncPath = Parameters<typeof actual.existsSync>[0];
  return {
    ...actual,
    existsSync: vi.fn((target: ExistsSyncPath) => {
      if (typeof target === "string" && target.endsWith(".env")) {
        return fileState.hasCliDotEnv;
      }
      return actual.existsSync(target);
    }),
  };
});

vi.mock("./dotenv.js", () => ({
  loadCliDotEnv: dotenvState.loadDotEnv,
}));

vi.mock("../infra/env.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../infra/env.js")>()),
  normalizeEnv: vi.fn(),
}));

vi.mock("../infra/runtime-guard.js", () => ({
  assertSupportedRuntime: vi.fn(),
}));

vi.mock("../infra/path-env.js", () => ({
  ensureMangabaClawCliOnPath: vi.fn(),
}));

vi.mock("./route.js", () => ({
  tryRouteCli: vi.fn(async () => true),
}));

vi.mock("./windows-argv.js", () => ({
  normalizeWindowsArgv: (argv: string[]) => argv,
}));

vi.mock("./container-target.js", async () => {
  const actual =
    await vi.importActual<typeof import("./container-target.js")>("./container-target.js");
  return {
    ...actual,
    maybeRunCliInContainer: maybeRunCliInContainerMock,
  };
});

import { runCli } from "./run-main.js";

describe("runCli profile env bootstrap", () => {
  const envSnapshot = captureEnv([
    "MANGABACLAW_PROFILE",
    "MANGABACLAW_STATE_DIR",
    "MANGABACLAW_CONFIG_PATH",
    "MANGABACLAW_CONTAINER",
    "MANGABACLAW_GATEWAY_PORT",
    "MANGABACLAW_GATEWAY_URL",
    "MANGABACLAW_GATEWAY_TOKEN",
    "MANGABACLAW_GATEWAY_PASSWORD",
  ]);

  beforeEach(() => {
    deleteTestEnvValue("MANGABACLAW_PROFILE");
    deleteTestEnvValue("MANGABACLAW_STATE_DIR");
    deleteTestEnvValue("MANGABACLAW_CONFIG_PATH");
    deleteTestEnvValue("MANGABACLAW_CONTAINER");
    deleteTestEnvValue("MANGABACLAW_GATEWAY_PORT");
    deleteTestEnvValue("MANGABACLAW_GATEWAY_URL");
    deleteTestEnvValue("MANGABACLAW_GATEWAY_TOKEN");
    deleteTestEnvValue("MANGABACLAW_GATEWAY_PASSWORD");
    dotenvState.state.profileAtDotenvLoad = undefined;
    dotenvState.state.containerAtDotenvLoad = undefined;
    dotenvState.loadDotEnv.mockClear();
    maybeRunCliInContainerMock.mockClear();
    fileState.hasCliDotEnv = false;
  });

  afterEach(() => {
    envSnapshot.restore();
  });

  it("applies --profile before dotenv loading", async () => {
    fileState.hasCliDotEnv = true;
    await runCli(["node", "mangabaclaw", "--profile", "rawdog", "status"]);

    expect(dotenvState.loadDotEnv).toHaveBeenCalledOnce();
    expect(dotenvState.state.profileAtDotenvLoad).toBe("rawdog");
    expect(process.env.MANGABACLAW_PROFILE).toBe("rawdog");
  });

  it("rejects --container combined with --profile", async () => {
    await expect(
      runCli(["node", "mangabaclaw", "--container", "demo", "--profile", "rawdog", "status"]),
    ).rejects.toThrow("--container cannot be combined with --profile/--dev");

    expect(dotenvState.loadDotEnv).not.toHaveBeenCalled();
    expect(process.env.MANGABACLAW_PROFILE).toBe("rawdog");
  });

  it("rejects --container combined with interleaved --profile", async () => {
    await expect(
      runCli(["node", "mangabaclaw", "status", "--container", "demo", "--profile", "rawdog"]),
    ).rejects.toThrow("--container cannot be combined with --profile/--dev");
  });

  it("rejects --container combined with interleaved --dev", async () => {
    await expect(
      runCli(["node", "mangabaclaw", "status", "--container", "demo", "--dev"]),
    ).rejects.toThrow("--container cannot be combined with --profile/--dev");
  });

  it("does not let dotenv change container target resolution", async () => {
    fileState.hasCliDotEnv = true;
    dotenvState.loadDotEnv.mockImplementationOnce(() => {
      process.env.MANGABACLAW_CONTAINER = "demo";
      dotenvState.state.profileAtDotenvLoad = process.env.MANGABACLAW_PROFILE;
      dotenvState.state.containerAtDotenvLoad = process.env.MANGABACLAW_CONTAINER;
    });

    await runCli(["node", "mangabaclaw", "status"]);

    expect(dotenvState.loadDotEnv).toHaveBeenCalledOnce();
    expect(process.env.MANGABACLAW_CONTAINER).toBe("demo");
    expect(dotenvState.state.containerAtDotenvLoad).toBe("demo");
    expect(maybeRunCliInContainerMock).toHaveBeenCalledWith(["node", "mangabaclaw", "status"]);
    expect(maybeRunCliInContainerMock).toHaveReturnedWith({
      handled: false,
      argv: ["node", "mangabaclaw", "status"],
    });
  });

  it("allows container mode when MANGABACLAW_PROFILE is already set in env", async () => {
    setTestEnvValue("MANGABACLAW_PROFILE", "work");

    await expect(
      runCli(["node", "mangabaclaw", "--container", "demo", "status"]),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["MANGABACLAW_GATEWAY_PORT", "19001"],
    ["MANGABACLAW_GATEWAY_URL", "ws://127.0.0.1:18789"],
    ["MANGABACLAW_GATEWAY_TOKEN", "demo-token"],
    ["MANGABACLAW_GATEWAY_PASSWORD", "demo-password"],
  ])("allows container mode when %s is set in env", async (key, value) => {
    setTestEnvValue(key, value);

    await expect(
      runCli(["node", "mangabaclaw", "--container", "demo", "status"]),
    ).resolves.toBeUndefined();
  });

  it("allows container mode when only MANGABACLAW_STATE_DIR is set in env", async () => {
    setTestEnvValue("MANGABACLAW_STATE_DIR", "/tmp/mangabaclaw-host-state");

    await expect(
      runCli(["node", "mangabaclaw", "--container", "demo", "status"]),
    ).resolves.toBeUndefined();
  });

  it("allows container mode when only MANGABACLAW_CONFIG_PATH is set in env", async () => {
    setTestEnvValue("MANGABACLAW_CONFIG_PATH", "/tmp/mangabaclaw-host-state/mangabaclaw.json");

    await expect(
      runCli(["node", "mangabaclaw", "--container", "demo", "status"]),
    ).resolves.toBeUndefined();
  });
});
