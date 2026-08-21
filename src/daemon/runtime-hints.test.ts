// Daemon runtime hint tests cover platform-specific daemon guidance.
import { describe, expect, it } from "vitest";
import { buildPlatformRuntimeLogHints, buildPlatformServiceStartHints } from "./runtime-hints.js";

describe("buildPlatformRuntimeLogHints", () => {
  it("renders launchd log hints on darwin", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "darwin",
        env: {
          HOME: "/Users/test",
          MANGABACLAW_STATE_DIR: "/tmp/mangabaclaw-state",
          MANGABACLAW_LOG_PREFIX: "gateway",
        },
        systemdServiceName: "mangabaclaw-gateway",
        windowsTaskName: "MangabaClaw Gateway",
      }),
    ).toEqual([
      "Launchd stdout (if installed): /Users/test/Library/Logs/mangabaclaw/gateway.log",
      "Launchd stderr (if installed): suppressed",
      "Restart attempts: /tmp/mangabaclaw-state/logs/gateway-restart.log",
    ]);
  });

  it("renders systemd and windows hints by platform", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "linux",
        env: {
          MANGABACLAW_STATE_DIR: "/tmp/mangabaclaw-state",
        },
        systemdServiceName: "mangabaclaw-gateway",
        windowsTaskName: "MangabaClaw Gateway",
      }),
    ).toEqual([
      "Logs: journalctl --user -u mangabaclaw-gateway.service -n 200 --no-pager",
      "Restart attempts: /tmp/mangabaclaw-state/logs/gateway-restart.log",
    ]);
    expect(
      buildPlatformRuntimeLogHints({
        platform: "win32",
        env: {
          MANGABACLAW_STATE_DIR: "/tmp/mangabaclaw-state",
        },
        systemdServiceName: "mangabaclaw-gateway",
        windowsTaskName: "MangabaClaw Gateway",
      }),
    ).toEqual([
      'Logs: schtasks /Query /TN "MangabaClaw Gateway" /V /FO LIST',
      "Restart attempts: /tmp/mangabaclaw-state/logs/gateway-restart.log",
    ]);
  });
});

describe("buildPlatformServiceStartHints", () => {
  it("builds platform-specific service start hints", () => {
    expect(
      buildPlatformServiceStartHints({
        platform: "darwin",
        installCommand: "mangabaclaw gateway install",
        startCommand: "mangabaclaw gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.mangabaclaw.gateway.plist",
        systemdServiceName: "mangabaclaw-gateway",
        windowsTaskName: "MangabaClaw Gateway",
      }),
    ).toEqual([
      "mangabaclaw gateway install",
      "mangabaclaw gateway",
      "launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.mangabaclaw.gateway.plist",
    ]);
    expect(
      buildPlatformServiceStartHints({
        platform: "linux",
        installCommand: "mangabaclaw gateway install",
        startCommand: "mangabaclaw gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.mangabaclaw.gateway.plist",
        systemdServiceName: "mangabaclaw-gateway",
        windowsTaskName: "MangabaClaw Gateway",
      }),
    ).toEqual([
      "mangabaclaw gateway install",
      "mangabaclaw gateway",
      "systemctl --user start mangabaclaw-gateway.service",
    ]);
  });
});
