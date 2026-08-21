// Tests compile-cache child-process spawning and environment propagation.
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../test/helpers/temp-dir.js";
import { resolveEntryInstallRoot } from "./entry.compile-cache.js";
import {
  buildMangabaClawCompileCacheRespawnPlan,
  isSourceCheckoutInstallRoot,
  resolveMangabaClawCompileCacheDirectory,
  runMangabaClawCompileCacheRespawnPlan,
  shouldEnableMangabaClawCompileCache,
} from "./entry.compile-cache.test-support.js";

function requireFirstMockCall(mock: { mock: { calls: unknown[][] } }, label: string): unknown[] {
  const [call] = mock.mock.calls;
  if (!call) {
    throw new Error(`expected ${label} call`);
  }
  return call;
}

describe("entry compile cache", () => {
  const tempDirs = useAutoCleanupTempDirTracker(afterEach);

  it("resolves install roots from source and dist entry paths", () => {
    expect(resolveEntryInstallRoot("/repo/mangabaclaw/src/entry.ts")).toBe("/repo/mangabaclaw");
    expect(resolveEntryInstallRoot("/repo/mangabaclaw/dist/entry.js")).toBe("/repo/mangabaclaw");
    expect(resolveEntryInstallRoot("/pkg/mangabaclaw/entry.js")).toBe("/pkg/mangabaclaw");
  });

  it("treats git and source entry markers as source checkouts", async () => {
    const root = tempDirs.make("mangabaclaw-compile-cache-source-");
    await fs.writeFile(path.join(root, ".git"), "gitdir: .git/worktrees/mangabaclaw\n", "utf8");

    expect(isSourceCheckoutInstallRoot(root)).toBe(true);
  });

  it("disables compile cache for source-checkout installs", async () => {
    const root = tempDirs.make("mangabaclaw-compile-cache-src-entry-");
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "entry.ts"), "export {};\n", "utf8");

    expect(
      shouldEnableMangabaClawCompileCache({
        env: {},
        installRoot: root,
      }),
    ).toBe(false);
  });

  it("keeps compile cache enabled for packaged installs unless disabled by env", () => {
    const root = tempDirs.make("mangabaclaw-compile-cache-package-");

    expect(
      shouldEnableMangabaClawCompileCache({
        env: {},
        installRoot: root,
      }),
    ).toBe(true);
    expect(
      shouldEnableMangabaClawCompileCache({
        env: { NODE_DISABLE_COMPILE_CACHE: "1" },
        installRoot: root,
      }),
    ).toBe(false);
  });

  it("scopes packaged compile cache by package install metadata", async () => {
    const root = tempDirs.make("mangabaclaw-compile-cache-package-key-");
    const packageJsonPath = path.join(root, "package.json");
    await fs.writeFile(packageJsonPath, '{"version":"2026.4.29"}\n', "utf8");

    const directory = resolveMangabaClawCompileCacheDirectory({
      env: { NODE_COMPILE_CACHE: path.join(root, ".node-cache") },
      installRoot: root,
    });

    expect(directory).toContain(path.join(".node-cache", "mangabaclaw"));
    expect(directory).toContain("2026.4.29");
    expect(path.basename(directory)).toMatch(/^\d+-\d+$/);
  });

  it("invalidates a replaced installation without deleting shared compile caches", async () => {
    const root = tempDirs.make("mangabaclaw-compile-cache-package-reinstall-");
    const packageJsonPath = path.join(root, "package.json");
    const cacheRoot = path.join(root, ".node-cache");
    await fs.writeFile(packageJsonPath, '{"version":"2026.4.29"}\n', "utf8");

    const originalDirectory = resolveMangabaClawCompileCacheDirectory({
      env: { NODE_COMPILE_CACHE: cacheRoot },
      installRoot: root,
    });
    await fs.mkdir(originalDirectory, { recursive: true });
    const originalCacheEntry = path.join(originalDirectory, "keep.txt");
    await fs.writeFile(originalCacheEntry, "previous cached installation\n", "utf8");

    await fs.writeFile(
      packageJsonPath,
      '{"version":"2026.4.29","installation":"replacement"}\n',
      "utf8",
    );
    const replacementDirectory = resolveMangabaClawCompileCacheDirectory({
      env: { NODE_COMPILE_CACHE: cacheRoot },
      installRoot: root,
    });

    expect(replacementDirectory).toContain(path.join("mangabaclaw", "2026.4.29"));
    expect(replacementDirectory).not.toBe(originalDirectory);
    await expect(fs.readFile(originalCacheEntry, "utf8")).resolves.toBe(
      "previous cached installation\n",
    );
  });

  it("builds a one-shot no-cache respawn plan when source checkout inherits NODE_COMPILE_CACHE", async () => {
    const root = tempDirs.make("mangabaclaw-compile-cache-respawn-");
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "entry.ts"), "export {};\n", "utf8");

    const plan = buildMangabaClawCompileCacheRespawnPlan({
      currentFile: path.join(root, "dist", "entry.js"),
      env: { NODE_COMPILE_CACHE: "/tmp/mangabaclaw-cache" },
      execArgv: ["--no-warnings"],
      execPath: "/usr/bin/node",
      installRoot: root,
      argv: ["/usr/bin/node", path.join(root, "dist", "entry.js"), "status", "--json"],
    });

    expect(plan).toEqual({
      command: "/usr/bin/node",
      args: ["--no-warnings", path.join(root, "dist", "entry.js"), "status", "--json"],
      env: {
        NODE_DISABLE_COMPILE_CACHE: "1",
        MANGABACLAW_COMPILE_CACHE_DISABLED_RESPAWNED: "1",
      },
      detachForProcessTree: true,
    });
  });

  it("keeps POSIX native hook relays on the timeout-owned process", async () => {
    const root = tempDirs.make("mangabaclaw-compile-cache-relay-");
    const entryFile = path.join(root, "src", "entry.ts");
    await fs.mkdir(path.dirname(entryFile), { recursive: true });
    await fs.writeFile(entryFile, "export {};\n", "utf8");
    const params = {
      currentFile: entryFile,
      env: { NODE_COMPILE_CACHE: "/tmp/mangabaclaw-cache" },
      execPath: "/usr/bin/node",
      installRoot: root,
      argv: ["/usr/bin/node", entryFile, "hooks", "relay", "--relay-id", "relay-1"],
    };

    expect(
      buildMangabaClawCompileCacheRespawnPlan({
        ...params,
        platform: "linux",
      }),
    ).toBeUndefined();
    expect(
      buildMangabaClawCompileCacheRespawnPlan({
        ...params,
        platform: "win32",
      }),
    ).toBeDefined();
  });

  it("keeps interactive no-cache respawn plans attached to the terminal", async () => {
    const root = tempDirs.make("mangabaclaw-compile-cache-interactive-");
    const entryFile = path.join(root, "dist", "entry.js");
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "entry.ts"), "export {};\n", "utf8");

    const plan = buildMangabaClawCompileCacheRespawnPlan({
      currentFile: entryFile,
      env: { NODE_COMPILE_CACHE: "/tmp/mangabaclaw-cache" },
      execPath: "/usr/bin/node",
      installRoot: root,
      argv: ["/usr/bin/node", entryFile, "tui"],
    });

    expect(plan?.detachForProcessTree).toBe(false);
  });

  it("keeps bare-root no-cache respawn plans attached to the terminal", async () => {
    const root = tempDirs.make("mangabaclaw-compile-cache-root-");
    const entryFile = path.join(root, "dist", "entry.js");
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "entry.ts"), "export {};\n", "utf8");

    const plan = buildMangabaClawCompileCacheRespawnPlan({
      currentFile: entryFile,
      env: { NODE_COMPILE_CACHE: "/tmp/mangabaclaw-cache" },
      execPath: "/usr/bin/node",
      installRoot: root,
      argv: ["/usr/bin/node", entryFile],
    });

    expect(plan?.detachForProcessTree).toBe(false);
  });

  it("does not respawn packaged installs when NODE_COMPILE_CACHE is configured", () => {
    const root = tempDirs.make("mangabaclaw-compile-cache-package-respawn-");

    expect(
      buildMangabaClawCompileCacheRespawnPlan({
        currentFile: path.join(root, "dist", "entry.js"),
        env: { NODE_COMPILE_CACHE: "/tmp/mangabaclaw-cache" },
        installRoot: root,
      }),
    ).toBeUndefined();
  });

  it("does not respawn source checkouts twice", async () => {
    const root = tempDirs.make("mangabaclaw-compile-cache-respawn-once-");
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "entry.ts"), "export {};\n", "utf8");

    expect(
      buildMangabaClawCompileCacheRespawnPlan({
        currentFile: path.join(root, "dist", "entry.js"),
        env: {
          NODE_COMPILE_CACHE: "/tmp/mangabaclaw-cache",
          MANGABACLAW_COMPILE_CACHE_DISABLED_RESPAWNED: "1",
        },
        installRoot: root,
      }),
    ).toBeUndefined();
  });

  it("runs compile-cache respawn plans with the child-process bridge", () => {
    const child = new EventEmitter() as ChildProcess;
    const spawn = vi.fn(() => child);
    const attachChildProcessBridge = vi.fn();
    const exit = vi.fn();
    const writeError = vi.fn();

    runMangabaClawCompileCacheRespawnPlan(
      {
        command: "/usr/bin/node",
        args: ["/repo/mangabaclaw/dist/entry.js", "status"],
        env: { NODE_DISABLE_COMPILE_CACHE: "1" },
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
        env: { NODE_DISABLE_COMPILE_CACHE: "1" },
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

  it("marks signal-terminated compile-cache respawn children as failed without forcing another exit", () => {
    const child = new EventEmitter() as ChildProcess;
    const spawn = vi.fn(() => child);
    const exit = vi.fn();

    runMangabaClawCompileCacheRespawnPlan(
      {
        command: "/usr/bin/node",
        args: ["/repo/mangabaclaw/dist/entry.js"],
        env: {},
        detachForProcessTree: true,
      },
      {
        spawn: spawn as unknown as typeof import("node:child_process").spawn,
        attachChildProcessBridge: vi.fn(),
        exit: exit as unknown as (code?: number) => never,
        writeError: vi.fn(),
      },
    );

    child.emit("exit", null, "SIGTERM");

    expect(exit).toHaveBeenCalledWith(1);
  });

  it("waits for a signaled compile-cache respawn child after force-killing it", () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as ChildProcess;
    const kill = vi.fn<(signal?: NodeJS.Signals) => boolean>(() => true);
    child.kill = kill as ChildProcess["kill"];
    const spawn = vi.fn(() => child);
    const exit = vi.fn();
    let onSignal: ((signal: NodeJS.Signals) => void) | undefined;

    try {
      runMangabaClawCompileCacheRespawnPlan(
        {
          command: "/usr/bin/node",
          args: ["/repo/mangabaclaw/dist/entry.js"],
          env: {},
          detachForProcessTree: false,
        },
        {
          spawn: spawn as unknown as typeof import("node:child_process").spawn,
          attachChildProcessBridge: vi.fn((_child, options) => {
            onSignal = options?.onSignal;
            return { detach: vi.fn() };
          }),
          exit: exit as unknown as (code?: number) => never,
          writeError: vi.fn(),
        },
      );

      onSignal?.("SIGTERM");
      vi.advanceTimersByTime(1_000);

      expect(kill).toHaveBeenCalledWith("SIGTERM");
      expect(exit).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1_000);

      expect(kill).toHaveBeenCalledWith(process.platform === "win32" ? "SIGTERM" : "SIGKILL");
      expect(exit).not.toHaveBeenCalled();

      child.emit("exit", null, "SIGKILL");

      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
