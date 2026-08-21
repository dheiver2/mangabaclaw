// Container target tests cover CLI container target parsing and validation.
import type { spawnSync as nodeSpawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  maybeRunCliInContainer,
  parseCliContainerArgs,
  resolveCliContainerTarget,
} from "./container-target.js";

function requireSpawnCall(
  spawnSync: ReturnType<typeof vi.fn>,
  index: number,
): [string, string[], unknown?] {
  const call = spawnSync.mock.calls[index];
  if (!call) {
    throw new Error(`Expected spawnSync call ${index}`);
  }
  return call as [string, string[], unknown?];
}

type SpawnResult = {
  status: number | null;
  stdout?: string;
  signal?: NodeJS.Signals;
};
type SpawnMock = ReturnType<typeof vi.fn> & typeof nodeSpawnSync;

const runningContainer = { status: 0, stdout: "true\n" };
const missingContainer = { status: 1, stdout: "" };
const successfulExec = { status: 0, stdout: "" };
const probeOptions = { encoding: "utf8", killSignal: "SIGKILL", timeout: 10_000 };

function mockSpawn(...results: SpawnResult[]): SpawnMock {
  const spawnSync = vi.fn();
  for (const result of results) {
    spawnSync.mockReturnValueOnce(result);
  }
  return spawnSync as SpawnMock;
}

function expectRuntimeProbe(
  spawnSync: SpawnMock,
  index: number,
  runtime: "podman" | "docker",
  container = "demo",
): void {
  expect(spawnSync).toHaveBeenNthCalledWith(
    index,
    runtime,
    ["inspect", "--format", "{{.State.Running}}", container],
    probeOptions,
  );
}

function expectContainerExec(
  spawnSync: SpawnMock,
  params: {
    runtime?: "podman" | "docker";
    argv?: string[];
    container?: string;
    index?: number;
    tty?: boolean;
    proxyUrl?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): void {
  const runtime = params.runtime ?? "podman";
  const envFlag = runtime === "docker" ? "-e" : "--env";
  expect(spawnSync).toHaveBeenNthCalledWith(
    params.index ?? 3,
    runtime,
    [
      "exec",
      "-i",
      ...(params.tty ? ["-t"] : []),
      envFlag,
      `MANGABACLAW_CONTAINER_HINT=${params.container ?? "demo"}`,
      envFlag,
      "MANGABACLAW_CLI_CONTAINER_BYPASS=1",
      ...(params.proxyUrl ? [envFlag, `MANGABACLAW_PROXY_URL=${params.proxyUrl}`] : []),
      params.container ?? "demo",
      "mangabaclaw",
      ...(params.argv ?? ["status"]),
    ],
    {
      stdio: "inherit",
      env: { ...params.env, MANGABACLAW_CONTAINER: "" },
    },
  );
}

describe("parseCliContainerArgs", () => {
  it("extracts a root --container flag before the command", () => {
    expect(
      parseCliContainerArgs(["node", "mangabaclaw", "--container", "demo", "status", "--deep"]),
    ).toEqual({
      ok: true,
      container: "demo",
      argv: ["node", "mangabaclaw", "status", "--deep"],
    });
  });

  it("accepts the equals form", () => {
    expect(parseCliContainerArgs(["node", "mangabaclaw", "--container=demo", "health"])).toEqual({
      ok: true,
      container: "demo",
      argv: ["node", "mangabaclaw", "health"],
    });
  });

  it("rejects a missing container value", () => {
    expect(parseCliContainerArgs(["node", "mangabaclaw", "--container"])).toEqual({
      ok: false,
      error: "--container requires a value",
    });
  });

  it("does not consume an adjacent flag as the container value", () => {
    expect(
      parseCliContainerArgs(["node", "mangabaclaw", "--container", "--no-color", "status"]),
    ).toEqual({
      ok: false,
      error: "--container requires a value",
    });
  });

  it("leaves argv unchanged when the flag is absent", () => {
    expect(parseCliContainerArgs(["node", "mangabaclaw", "status"])).toEqual({
      ok: true,
      container: null,
      argv: ["node", "mangabaclaw", "status"],
    });
  });

  it("extracts --container after the command like other root options", () => {
    expect(
      parseCliContainerArgs(["node", "mangabaclaw", "status", "--container", "demo", "--deep"]),
    ).toEqual({
      ok: true,
      container: "demo",
      argv: ["node", "mangabaclaw", "status", "--deep"],
    });
  });

  it("stops parsing --container after the -- terminator", () => {
    expect(
      parseCliContainerArgs([
        "node",
        "mangabaclaw",
        "nodes",
        "run",
        "--",
        "docker",
        "run",
        "--container",
        "demo",
        "alpine",
      ]),
    ).toEqual({
      ok: true,
      container: null,
      argv: [
        "node",
        "mangabaclaw",
        "nodes",
        "run",
        "--",
        "docker",
        "run",
        "--container",
        "demo",
        "alpine",
      ],
    });
  });
});

describe("resolveCliContainerTarget", () => {
  it("uses argv first and falls back to MANGABACLAW_CONTAINER", () => {
    expect(
      resolveCliContainerTarget(["node", "mangabaclaw", "--container", "demo", "status"], {}),
    ).toBe("demo");
    expect(resolveCliContainerTarget(["node", "mangabaclaw", "status"], {})).toBeNull();
    expect(
      resolveCliContainerTarget(["node", "mangabaclaw", "status"], {
        MANGABACLAW_CONTAINER: "demo",
      } as NodeJS.ProcessEnv),
    ).toBe("demo");
  });
});

describe("maybeRunCliInContainer", () => {
  it("passes through when no container target is provided", () => {
    expect(maybeRunCliInContainer(["node", "mangabaclaw", "status"], { env: {} })).toEqual({
      handled: false,
      argv: ["node", "mangabaclaw", "status"],
    });
  });

  it.each([
    { signal: "SIGINT" as const, exitCode: 130 },
    { signal: "SIGTERM" as const, exitCode: 143 },
  ])("preserves exit code $exitCode when the container child exits from $signal", (testCase) => {
    const spawnSync = mockSpawn(runningContainer, missingContainer, {
      status: null,
      signal: testCase.signal,
    });

    expect(
      maybeRunCliInContainer(["node", "mangabaclaw", "status"], {
        env: { MANGABACLAW_CONTAINER: "demo" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toEqual({
      handled: true,
      exitCode: testCase.exitCode,
    });
  });

  it("uses MANGABACLAW_CONTAINER when the flag is absent", () => {
    const spawnSync = mockSpawn(runningContainer, missingContainer, successfulExec);

    expect(
      maybeRunCliInContainer(["node", "mangabaclaw", "status"], {
        env: { MANGABACLAW_CONTAINER: "demo" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toEqual({
      handled: true,
      exitCode: 0,
    });

    expectContainerExec(spawnSync);
  });

  it("clears inherited host routing and gateway env before execing into the child CLI", () => {
    const spawnSync = mockSpawn(runningContainer, missingContainer, successfulExec);

    maybeRunCliInContainer(["node", "mangabaclaw", "status"], {
      env: {
        MANGABACLAW_CONTAINER: "demo",
        MANGABACLAW_PROFILE: "work",
        MANGABACLAW_GATEWAY_PORT: "19001",
        MANGABACLAW_GATEWAY_URL: "ws://127.0.0.1:18789",
        MANGABACLAW_GATEWAY_TOKEN: "token",
        MANGABACLAW_GATEWAY_PASSWORD: "password",
      } as NodeJS.ProcessEnv,
      spawnSync,
    });

    expectContainerExec(spawnSync);
  });

  it("passes the proxy URL env fallback into the child container CLI", () => {
    const spawnSync = mockSpawn(runningContainer, missingContainer, successfulExec);

    maybeRunCliInContainer(["node", "mangabaclaw", "status"], {
      env: {
        MANGABACLAW_CONTAINER: "demo",
        MANGABACLAW_PROXY_URL: " http://proxy.internal:3128 ",
      } as NodeJS.ProcessEnv,
      spawnSync,
    });

    expectContainerExec(spawnSync, {
      proxyUrl: "http://proxy.internal:3128",
      env: { MANGABACLAW_PROXY_URL: " http://proxy.internal:3128 " },
    });
  });

  it.each([
    "http://127.0.0.1:3128",
    "http://127.1:3128",
    "http://127.0.0.01:3128",
    "http://localhost.:3128",
    "http://[::1]:3128",
    "http://[::ffff:127.0.0.1]:3128",
  ])("fails before forwarding loopback proxy URL %s into a child container CLI", (proxyUrl) => {
    const spawnSync = mockSpawn(runningContainer, missingContainer);

    expect(() =>
      maybeRunCliInContainer(["node", "mangabaclaw", "status"], {
        env: {
          MANGABACLAW_CONTAINER: "demo",
          MANGABACLAW_PROXY_URL: ` ${proxyUrl} `,
        } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toThrow("127.0.0.1 inside a container points at the container");

    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it("redacts proxy URL credentials and URL suffixes before rejecting loopback container proxy forwarding", () => {
    const spawnSync = mockSpawn(runningContainer, missingContainer);

    let message = "";
    try {
      maybeRunCliInContainer(["node", "mangabaclaw", "status"], {
        env: {
          MANGABACLAW_CONTAINER: "demo",
          MANGABACLAW_PROXY_URL:
            "http://proxy-user:proxy-secret@127.1:3128?token=proxy-query-secret#proxy-fragment-secret",
        } as NodeJS.ProcessEnv,
        spawnSync,
      });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }

    expect(message).toContain("MANGABACLAW_PROXY_URL=http://redacted:redacted@127.0.0.1:3128/");
    expect(message).not.toContain("proxy-user");
    expect(message).not.toContain("proxy-secret");
    expect(message).not.toContain("proxy-query-secret");
    expect(message).not.toContain("proxy-fragment-secret");
    expect(message).not.toContain("?token=");
    expect(message).not.toContain("#");
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it("allows explicitly overridden loopback proxy URL forwarding into a child container CLI", () => {
    const spawnSync = mockSpawn(runningContainer, missingContainer, successfulExec);

    maybeRunCliInContainer(["node", "mangabaclaw", "status"], {
      env: {
        MANGABACLAW_CONTAINER: "demo",
        MANGABACLAW_PROXY_URL: " http://127.0.0.1:3128 ",
        MANGABACLAW_CONTAINER_ALLOW_LOOPBACK_PROXY_URL: "1",
      } as NodeJS.ProcessEnv,
      spawnSync,
    });

    const podmanCall = requireSpawnCall(spawnSync, 2);
    expect(podmanCall[0]).toBe("podman");
    expect(podmanCall[1]).toContain("MANGABACLAW_PROXY_URL=http://127.0.0.1:3128");
    if (podmanCall[2] === undefined) {
      throw new Error("Expected podman spawn options");
    }
  });

  it("executes through podman when the named container is running", () => {
    const spawnSync = mockSpawn(runningContainer, missingContainer, successfulExec);

    expect(
      maybeRunCliInContainer(["node", "mangabaclaw", "--container", "demo", "status"], {
        env: {},
        spawnSync,
      }),
    ).toEqual({
      handled: true,
      exitCode: 0,
    });

    expectRuntimeProbe(spawnSync, 1, "podman");
    expectContainerExec(spawnSync);
  });

  it("falls back to docker when podman does not have the container", () => {
    const spawnSync = mockSpawn(missingContainer, runningContainer, successfulExec);

    expect(
      maybeRunCliInContainer(["node", "mangabaclaw", "--container", "demo", "health"], {
        env: { USER: "mangabaclaw" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toEqual({
      handled: true,
      exitCode: 0,
    });

    expectRuntimeProbe(spawnSync, 2, "docker");
    expectContainerExec(spawnSync, {
      runtime: "docker",
      argv: ["health"],
      env: { USER: "mangabaclaw" },
    });
  });

  it("checks docker after podman and before failing", () => {
    const spawnSync = mockSpawn(missingContainer, runningContainer, successfulExec, successfulExec);

    expect(
      maybeRunCliInContainer(["node", "mangabaclaw", "--container", "demo", "status"], {
        env: { USER: "somalley" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toEqual({
      handled: true,
      exitCode: 0,
    });

    expectRuntimeProbe(spawnSync, 1, "podman");
    expectRuntimeProbe(spawnSync, 2, "docker");
    expectContainerExec(spawnSync, { runtime: "docker", env: { USER: "somalley" } });
    expect(spawnSync).toHaveBeenCalledTimes(3);
  });

  it("does not try any sudo podman fallback for regular users", () => {
    const spawnSync = mockSpawn(missingContainer, missingContainer);

    expect(() =>
      maybeRunCliInContainer(["node", "mangabaclaw", "--container", "demo", "status"], {
        env: { USER: "somalley" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toThrow('No running container matched "demo" under podman or docker.');

    expect(spawnSync).toHaveBeenCalledTimes(2);
    expectRuntimeProbe(spawnSync, 1, "podman");
    expectRuntimeProbe(spawnSync, 2, "docker");
  });

  it("rejects ambiguous matches across runtimes", () => {
    const spawnSync = mockSpawn(runningContainer, runningContainer, missingContainer);

    expect(() =>
      maybeRunCliInContainer(["node", "mangabaclaw", "--container", "demo", "status"], {
        env: { USER: "somalley" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toThrow(
      'Container "demo" is running under multiple runtimes (podman, docker); use a unique container name.',
    );
  });

  it("allocates a tty for interactive terminal sessions", () => {
    const spawnSync = mockSpawn(runningContainer, missingContainer, successfulExec);

    maybeRunCliInContainer(["node", "mangabaclaw", "--container", "demo", "setup"], {
      env: {},
      spawnSync,
      stdinIsTTY: true,
      stdoutIsTTY: true,
    });

    expectContainerExec(spawnSync, { argv: ["setup"], tty: true });
  });

  it("prefers --container over MANGABACLAW_CONTAINER", () => {
    const spawnSync = mockSpawn(runningContainer, missingContainer, successfulExec);

    expect(
      maybeRunCliInContainer(["node", "mangabaclaw", "--container", "flag-demo", "health"], {
        env: { MANGABACLAW_CONTAINER: "env-demo" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toEqual({
      handled: true,
      exitCode: 0,
    });

    expectRuntimeProbe(spawnSync, 1, "podman", "flag-demo");
  });

  it("throws when the named container is not running", () => {
    const spawnSync = mockSpawn(missingContainer, missingContainer);

    expect(() =>
      maybeRunCliInContainer(["node", "mangabaclaw", "--container", "demo", "status"], {
        env: {},
        spawnSync,
      }),
    ).toThrow('No running container matched "demo" under podman or docker.');
  });

  it("skips recursion when the bypass env is set", () => {
    expect(
      maybeRunCliInContainer(["node", "mangabaclaw", "--container", "demo", "status"], {
        env: { MANGABACLAW_CLI_CONTAINER_BYPASS: "1" } as NodeJS.ProcessEnv,
      }),
    ).toEqual({
      handled: false,
      argv: ["node", "mangabaclaw", "--container", "demo", "status"],
    });
  });

  it("blocks updater commands from running inside the container", () => {
    const spawnSync = mockSpawn(runningContainer);

    expect(() =>
      maybeRunCliInContainer(["node", "mangabaclaw", "--container", "demo", "update"], {
        env: {},
        spawnSync,
      }),
    ).toThrow(
      "mangabaclaw update is not supported with --container; rebuild or restart the container image instead.",
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("blocks update after interleaved root flags", () => {
    const spawnSync = mockSpawn(runningContainer);

    expect(() =>
      maybeRunCliInContainer(["node", "mangabaclaw", "--container", "demo", "--no-color", "update"], {
        env: {},
        spawnSync,
      }),
    ).toThrow(
      "mangabaclaw update is not supported with --container; rebuild or restart the container image instead.",
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("blocks the --update shorthand from running inside the container", () => {
    const spawnSync = mockSpawn(runningContainer);

    expect(() =>
      maybeRunCliInContainer(["node", "mangabaclaw", "--container", "demo", "--update"], {
        env: {},
        spawnSync,
      }),
    ).toThrow(
      "mangabaclaw update is not supported with --container; rebuild or restart the container image instead.",
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
