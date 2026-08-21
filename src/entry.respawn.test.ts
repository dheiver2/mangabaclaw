// Tests entrypoint respawn behavior for compile cache and process flags.
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { buildCliRespawnPlan, runCliRespawnPlan } from "./entry.respawn.js";

const EXPERIMENTAL_WARNING_FLAG = "--disable-warning=ExperimentalWarning";
const MANGABACLAW_NODE_EXTRA_CA_CERTS_READY = "MANGABACLAW_NODE_EXTRA_CA_CERTS_READY";
const MANGABACLAW_NODE_OPTIONS_READY = "MANGABACLAW_NODE_OPTIONS_READY";

type CliRespawnPlan = NonNullable<ReturnType<typeof buildCliRespawnPlan>>;

function expectCliRespawnPlan(plan: ReturnType<typeof buildCliRespawnPlan>): CliRespawnPlan {
  if (plan === null) {
    throw new Error("Expected CLI respawn plan");
  }
  return plan;
}

function requireFirstMockCall(mock: { mock: { calls: unknown[][] } }, label: string): unknown[] {
  const [call] = mock.mock.calls;
  if (!call) {
    throw new Error(`expected ${label} call`);
  }
  return call;
}

describe("buildCliRespawnPlan", () => {
  it("returns null when respawn policy skips the argv", () => {
    expect(
      buildCliRespawnPlan({
        argv: ["node", "mangabaclaw", "--help"],
        env: {},
        execArgv: [],
        autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
      }),
    ).toBeNull();
  });

  it("does not detach native hook relays through a startup respawn", () => {
    expect(
      buildCliRespawnPlan({
        argv: ["node", "mangabaclaw", "hooks", "relay", "--relay-id", "relay-1"],
        env: {},
        execArgv: [],
        autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
        platform: "linux",
      }),
    ).toBeNull();
  });

  it("adds NODE_EXTRA_CA_CERTS and warning suppression in one respawn", () => {
    const plan = buildCliRespawnPlan({
      argv: ["node", "mangabaclaw", "status"],
      env: {},
      execArgv: [],
      autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
      platform: "linux",
    });

    const respawnPlan = expectCliRespawnPlan(plan);
    expect(respawnPlan.command).toBe(process.execPath);
    expect(respawnPlan.argv[0]).toBe(EXPERIMENTAL_WARNING_FLAG);
    expect(respawnPlan.env.NODE_EXTRA_CA_CERTS).toBe("/etc/ssl/certs/ca-certificates.crt");
    expect(respawnPlan.env[MANGABACLAW_NODE_EXTRA_CA_CERTS_READY]).toBe("1");
    expect(respawnPlan.env[MANGABACLAW_NODE_OPTIONS_READY]).toBe("1");
    expect(respawnPlan.detachForProcessTree).toBe(true);
  });

  it.each(["tui", "terminal", "chat"] as const)(
    "preserves NODE_EXTRA_CA_CERTS respawn for interactive %s",
    (command) => {
      const plan = buildCliRespawnPlan({
        argv: ["node", "mangabaclaw", command],
        env: {},
        execArgv: [],
        autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
        platform: "linux",
      });

      const respawnPlan = expectCliRespawnPlan(plan);
      expect(respawnPlan.argv).toEqual(["mangabaclaw", command]);
      expect(respawnPlan.env.NODE_EXTRA_CA_CERTS).toBe("/etc/ssl/certs/ca-certificates.crt");
      expect(respawnPlan.env[MANGABACLAW_NODE_EXTRA_CA_CERTS_READY]).toBe("1");
      expect(respawnPlan.env[MANGABACLAW_NODE_OPTIONS_READY]).toBeUndefined();
      expect(respawnPlan.detachForProcessTree).toBe(false);
    },
  );

  it("keeps bare-root startup respawns attached to the terminal", () => {
    const plan = buildCliRespawnPlan({
      argv: ["node", "mangabaclaw"],
      env: {},
      execArgv: [],
      autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
      platform: "linux",
    });

    const respawnPlan = expectCliRespawnPlan(plan);
    expect(respawnPlan.argv).toEqual([EXPERIMENTAL_WARNING_FLAG, "mangabaclaw"]);
    expect(respawnPlan.detachForProcessTree).toBe(false);
  });

  it("preserves macOS system CA trust through one-shot warning respawns", () => {
    const plan = buildCliRespawnPlan({
      argv: ["node", "mangabaclaw", "cron", "list", "--json"],
      env: { NODE_USE_SYSTEM_CA: "1" },
      execArgv: [],
      autoNodeExtraCaCerts: undefined,
      platform: "darwin",
    });

    const respawnPlan = expectCliRespawnPlan(plan);
    expect(respawnPlan.argv).toEqual([
      EXPERIMENTAL_WARNING_FLAG,
      "mangabaclaw",
      "cron",
      "list",
      "--json",
    ]);
    expect(respawnPlan.env.NODE_USE_SYSTEM_CA).toBe("1");
  });

  it.each([
    ["interactive commands", ["node", "mangabaclaw", "tui"]],
    ["the foreground Gateway", ["node", "mangabaclaw", "gateway", "run"]],
  ] as const)("keeps macOS system CA loading for %s", (_label, argv) => {
    expect(
      buildCliRespawnPlan({
        argv: [...argv],
        env: { NODE_USE_SYSTEM_CA: "1" },
        execArgv: [],
        autoNodeExtraCaCerts: undefined,
        platform: "darwin",
      }),
    ).toBeNull();
  });

  it("does not respawn one-shot commands only to change CA trust", () => {
    expect(
      buildCliRespawnPlan({
        argv: ["node", "mangabaclaw", "cron", "list", "--json"],
        env: {
          NODE_USE_SYSTEM_CA: "1",
          [MANGABACLAW_NODE_OPTIONS_READY]: "1",
        },
        execArgv: [EXPERIMENTAL_WARNING_FLAG],
        autoNodeExtraCaCerts: undefined,
        platform: "darwin",
      }),
    ).toBeNull();
  });

  it("does not respawn interactive commands for warning suppression only", () => {
    expect(
      buildCliRespawnPlan({
        argv: ["node", "mangabaclaw", "tui"],
        env: { [MANGABACLAW_NODE_EXTRA_CA_CERTS_READY]: "1" },
        execArgv: [],
        autoNodeExtraCaCerts: undefined,
        platform: "linux",
      }),
    ).toBeNull();
  });

  it("does not overwrite an existing NODE_EXTRA_CA_CERTS value", () => {
    const plan = buildCliRespawnPlan({
      argv: ["node", "mangabaclaw", "status"],
      env: { NODE_EXTRA_CA_CERTS: "/custom/ca.pem" },
      execArgv: [],
      autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
      platform: "linux",
    });

    const respawnPlan = expectCliRespawnPlan(plan);
    expect(respawnPlan.env.NODE_EXTRA_CA_CERTS).toBe("/custom/ca.pem");
  });

  it("returns null when both respawn guards are already satisfied", () => {
    expect(
      buildCliRespawnPlan({
        argv: ["node", "mangabaclaw", "status"],
        env: {
          [MANGABACLAW_NODE_EXTRA_CA_CERTS_READY]: "1",
          [MANGABACLAW_NODE_OPTIONS_READY]: "1",
        },
        execArgv: [EXPERIMENTAL_WARNING_FLAG],
        autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
        platform: "linux",
      }),
    ).toBeNull();
  });

  it("adds a larger V8 stack size on Windows", () => {
    const plan = buildCliRespawnPlan({
      argv: [
        "node",
        "C:\\Users\\alice\\AppData\\Roaming\\npm\\node_modules\\mangabaclaw\\mangabaclaw.mjs",
        "dashboard",
      ],
      env: {},
      execArgv: [],
      autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
      platform: "win32",
    });

    const respawnPlan = expectCliRespawnPlan(plan);
    expect(respawnPlan.argv).toEqual([
      "--stack-size=8192",
      "C:\\Users\\alice\\AppData\\Roaming\\npm\\node_modules\\mangabaclaw\\mangabaclaw.mjs",
      "dashboard",
    ]);
    expect(respawnPlan.env.NODE_EXTRA_CA_CERTS).toBeUndefined();
    expect(respawnPlan.env[MANGABACLAW_NODE_EXTRA_CA_CERTS_READY]).toBeUndefined();
    expect(respawnPlan.env[MANGABACLAW_NODE_OPTIONS_READY]).toBeUndefined();
    expect(respawnPlan.detachForProcessTree).toBe(false);
  });

  it("normalizes a duplicated Windows node.exe launcher prefix before respawning", () => {
    const scriptPath =
      "C:\\Users\\alice\\AppData\\Roaming\\npm\\node_modules\\mangabaclaw\\mangabaclaw.mjs";
    const plan = buildCliRespawnPlan({
      argv: [
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files\\nodejs\\node.exe",
        scriptPath,
        "dashboard",
        "--no-open",
      ],
      env: {},
      execArgv: [],
      execPath: "C:\\Program Files\\nodejs\\node.exe",
      platform: "win32",
    });

    const respawnPlan = expectCliRespawnPlan(plan);
    expect(respawnPlan.argv).toEqual(["--stack-size=8192", scriptPath, "dashboard", "--no-open"]);
  });

  it("preserves post-script node.exe arguments after normalizing the launcher prefix", () => {
    const scriptPath =
      "C:\\Users\\alice\\AppData\\Roaming\\npm\\node_modules\\mangabaclaw\\mangabaclaw.mjs";
    const plan = buildCliRespawnPlan({
      argv: [
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files\\nodejs\\node.exe",
        scriptPath,
        "node.exe",
        "status",
      ],
      env: {},
      execArgv: [],
      execPath: "C:\\Program Files\\nodejs\\node.exe",
      platform: "win32",
    });

    const respawnPlan = expectCliRespawnPlan(plan);
    expect(respawnPlan.argv).toEqual(["--stack-size=8192", scriptPath, "node.exe", "status"]);
  });

  it("does not respawn on Windows when stack size is already configured", () => {
    expect(
      buildCliRespawnPlan({
        argv: [
          "node",
          "C:\\Users\\alice\\AppData\\Roaming\\npm\\node_modules\\mangabaclaw\\mangabaclaw.mjs",
          "dashboard",
        ],
        env: {},
        execArgv: ["--stack-size=16384"],
        autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
        platform: "win32",
      }),
    ).toBeNull();
  });

  it("does not respawn on Windows when underscore stack size spelling is already configured", () => {
    expect(
      buildCliRespawnPlan({
        argv: [
          "node",
          "C:\\Users\\alice\\AppData\\Roaming\\npm\\node_modules\\mangabaclaw\\mangabaclaw.mjs",
          "dashboard",
        ],
        env: {},
        execArgv: ["--stack_size=16384"],
        autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
        platform: "win32",
      }),
    ).toBeNull();
  });

  it("respawns Volta shims through node so the shim is not called directly", () => {
    const plan = buildCliRespawnPlan({
      argv: ["/home/alice/.volta/bin/volta-shim", "/usr/local/bin/mangabaclaw", "status"],
      env: { PATH: "/home/alice/.volta/bin:/usr/bin:/bin" },
      execArgv: [],
      execPath: "/home/alice/.volta/bin/volta-shim",
      autoNodeExtraCaCerts: undefined,
      platform: "linux",
    });

    const respawnPlan = expectCliRespawnPlan(plan);
    expect(respawnPlan.command).toBe("node");
    expect(respawnPlan.argv).toEqual([
      EXPERIMENTAL_WARNING_FLAG,
      "/usr/local/bin/mangabaclaw",
      "status",
    ]);
    expect(respawnPlan.detachForProcessTree).toBe(true);
  });
});

describe("runCliRespawnPlan", () => {
  it("spawns and bridges the respawn child", () => {
    const child = new EventEmitter() as ChildProcess;
    const spawn = vi.fn(() => child);
    const attachChildProcessBridge = vi.fn();
    const exit = vi.fn();
    const writeError = vi.fn();

    runCliRespawnPlan(
      {
        command: "/usr/bin/node",
        argv: ["/repo/mangabaclaw/dist/entry.js", "status"],
        env: { MANGABACLAW_NODE_OPTIONS_READY: "1" },
        detachForProcessTree: true,
      },
      {
        spawn: spawn as unknown as typeof import("node:child_process").spawn,
        attachChildProcessBridge,
        exit: exit as unknown as (code?: number) => never,
        writeError,
      },
    );

    expect(spawn).toHaveBeenCalledWith(
      "/usr/bin/node",
      ["/repo/mangabaclaw/dist/entry.js", "status"],
      {
        stdio: "inherit",
        env: { MANGABACLAW_NODE_OPTIONS_READY: "1" },
        detached: process.platform !== "win32" && !(process.stdin.isTTY || process.stdout.isTTY),
      },
    );
    const [bridgeChild, bridgeOptions] = requireFirstMockCall(
      attachChildProcessBridge,
      "child process bridge attach",
    );
    expect(bridgeChild).toBe(child);
    expect(bridgeOptions).toEqual({ onSignal: expect.any(Function) });

    child.emit("exit", 0, null);

    expect(exit).toHaveBeenCalledWith(0);
    expect(writeError).not.toHaveBeenCalled();
  });
});
