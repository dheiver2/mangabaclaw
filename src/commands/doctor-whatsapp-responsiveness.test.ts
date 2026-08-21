// Doctor WhatsApp responsiveness tests cover warning heuristics and note output for stale connections.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";

const noteMock = vi.hoisted(() => vi.fn());
const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async () => {
  const { mockNodeChildProcessSpawnSync } = await import("mangabaclaw/plugin-sdk/test-node-mocks");
  return mockNodeChildProcessSpawnSync(spawnSyncMock, () =>
    vi.importActual<typeof import("node:child_process")>("node:child_process"),
  );
});

vi.mock("../../packages/terminal-core/src/note.js", () => ({
  note: noteMock,
}));

const { collectWhatsappResponsivenessHealthFindings, noteWhatsappResponsivenessHealth } =
  await import("./doctor-whatsapp-responsiveness.js");
const { listLocalTuiProcesses, terminateLocalTuiProcesses } =
  await import("./doctor-whatsapp-responsiveness.test-support.js");

describe("doctor WhatsApp responsiveness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists only verified local TUI processes", () => {
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: [
        " 101 mangabaclaw-tui",
        " 102 /usr/bin/node /usr/lib/node_modules/mangabaclaw/dist/index.js gateway --port 18789",
        " 103 mangabaclaw channels",
        " 104 mangabaclaw tui --local",
        " 105 /usr/bin/mangabaclaw chat",
        " 106 helper --note 'mangabaclaw tui'",
        " 107 mangabaclaw-helper mangabaclaw terminal",
        " 108 mangabaclaw --flag tui",
      ].join("\n"),
    });

    if (process.platform === "win32") {
      expect(listLocalTuiProcesses()).toEqual([]);
      expect(spawnSyncMock).not.toHaveBeenCalled();
    } else {
      expect(listLocalTuiProcesses()).toEqual([
        { pid: 101, command: "mangabaclaw-tui" },
        { pid: 104, command: "mangabaclaw tui --local" },
        { pid: 105, command: "/usr/bin/mangabaclaw chat" },
      ]);
      expect(spawnSyncMock).toHaveBeenCalledWith("ps", ["-axo", "pid=,command="], {
        encoding: "utf8",
        killSignal: "SIGKILL",
        timeout: 1_000,
      });
    }
  });

  it("terminates stale local TUI processes with a kill fallback", async () => {
    const alive = new Set([101]);
    const signals: Array<[number, string | number]> = [];
    const controller = {
      kill: vi.fn((pid: number, signal: string | number) => {
        signals.push([pid, signal]);
        if (signal === "SIGKILL") {
          alive.delete(pid);
          return true;
        }
        if (signal === 0) {
          if (alive.has(pid)) {
            return true;
          }
          throw new Error("gone");
        }
        return true;
      }),
    };

    await expect(
      terminateLocalTuiProcesses({
        processes: [{ pid: 101, command: "mangabaclaw-tui" }],
        controller,
        graceMs: 0,
      }),
    ).resolves.toEqual({ stopped: [101], failed: [] });
    expect(signals).toEqual([
      [101, "SIGTERM"],
      [101, 0],
      [101, "SIGKILL"],
      [101, 0],
    ]);
  });

  it("warns and repairs local TUI pressure when WhatsApp is enabled and the gateway is degraded", async () => {
    const terminate = vi.fn().mockResolvedValue({ stopped: [101], failed: [] });
    const cfg = { channels: { whatsapp: { enabled: true } } } as MangabaClawConfig;

    await noteWhatsappResponsivenessHealth({
      cfg,
      status: {
        eventLoop: {
          degraded: true,
          degradedSinceMs: 61_000,
          reasons: ["event_loop_delay"],
          intervalMs: 30_000,
          delayP99Ms: 42,
          delayMaxMs: 12_000,
          utilization: 0.3,
          cpuCoreRatio: 0.4,
        },
      },
      shouldRepair: true,
      listLocalTuiProcesses: () => [{ pid: 101, command: "mangabaclaw-tui" }],
      terminateLocalTuiProcesses: terminate,
    });

    expect(terminate).toHaveBeenCalledWith({
      processes: [{ pid: 101, command: "mangabaclaw-tui" }],
    });
    expect(noteMock).toHaveBeenCalledWith(
      [
        "Gateway event loop is degraded while local TUI clients are running.",
        "WhatsApp replies can queue behind TUI startup/session refresh work.",
        "Local TUI pids: 101",
        "",
        "Stopped local TUI clients: 101",
      ].join("\n"),
      "WhatsApp responsiveness",
    );
  });

  it("collects a warning finding for local TUI pressure when WhatsApp is enabled", () => {
    const cfg = { channels: { whatsapp: { enabled: true } } } as MangabaClawConfig;

    const findings = collectWhatsappResponsivenessHealthFindings({
      cfg,
      status: {
        eventLoop: {
          degraded: true,
          degradedSinceMs: 61_000,
          reasons: ["event_loop_delay"],
          intervalMs: 30_000,
          delayP99Ms: 42,
          delayMaxMs: 12_000,
          utilization: 0.3,
          cpuCoreRatio: 0.4,
        },
      },
      listLocalTuiProcesses: () => [{ pid: 101, command: "mangabaclaw-tui" }],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        checkId: "core/doctor/whatsapp-responsiveness",
        severity: "warning",
        path: "channels.whatsapp",
        target: "101",
        requirement: "local-tui-event-loop-pressure",
        fixHint: expect.stringContaining("mangabaclaw doctor --fix"),
      }),
    ]);
  });

  it("keeps WhatsApp responsiveness findings quiet without the exact pressure signal", () => {
    const cfg = { channels: { whatsapp: { enabled: true } } } as MangabaClawConfig;

    expect(
      collectWhatsappResponsivenessHealthFindings({
        cfg,
        status: {
          eventLoop: {
            degraded: false,
            degradedSinceMs: null,
            reasons: [],
            intervalMs: 1,
            delayP99Ms: 0,
            delayMaxMs: 0,
            utilization: 0,
            cpuCoreRatio: 0,
          },
        },
        listLocalTuiProcesses: () => [{ pid: 101, command: "mangabaclaw-tui" }],
      }),
    ).toEqual([]);
    expect(
      collectWhatsappResponsivenessHealthFindings({
        cfg,
        status: {
          eventLoop: {
            degraded: true,
            degradedSinceMs: 61_000,
            reasons: ["event_loop_delay"],
            intervalMs: 30_000,
            delayP99Ms: 42,
            delayMaxMs: 12_000,
            utilization: 0.3,
            cpuCoreRatio: 0.4,
          },
        },
        listLocalTuiProcesses: () => [],
      }),
    ).toEqual([]);
    expect(
      collectWhatsappResponsivenessHealthFindings({
        cfg: { channels: { whatsapp: { enabled: false } } } as MangabaClawConfig,
        status: {
          eventLoop: {
            degraded: true,
            degradedSinceMs: 61_000,
            reasons: ["event_loop_delay"],
            intervalMs: 30_000,
            delayP99Ms: 42,
            delayMaxMs: 12_000,
            utilization: 0.3,
            cpuCoreRatio: 0.4,
          },
        },
        listLocalTuiProcesses: () => [{ pid: 101, command: "mangabaclaw-tui" }],
      }),
    ).toEqual([]);
  });

  it("does not treat generic model routing as a WhatsApp-only issue", async () => {
    const cfg = {
      channels: { whatsapp: { enabled: true } },
      agents: { defaults: { model: { primary: "openai-codex/gpt-5.5" } } },
    } as MangabaClawConfig;

    await noteWhatsappResponsivenessHealth({
      cfg,
      status: {
        eventLoop: {
          degraded: false,
          degradedSinceMs: null,
          reasons: [],
          intervalMs: 1,
          delayP99Ms: 0,
          delayMaxMs: 0,
          utilization: 0,
          cpuCoreRatio: 0,
        },
      },
      shouldRepair: true,
      listLocalTuiProcesses: () => [],
    });

    expect(noteMock).not.toHaveBeenCalled();
  });
});
