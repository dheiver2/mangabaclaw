import { describe, expect, it } from "vitest";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { resolveHeartbeatMonitorSpecs } from "./heartbeat-monitor.js";

describe("resolveHeartbeatMonitorSpecs", () => {
  it("creates no monitor jobs for an ownerless explicit multi-agent roster", () => {
    const cfg = {
      agents: { ownership: "explicit", entries: { main: {}, ops: {} } },
    } as MangabaClawConfig;

    expect(resolveHeartbeatMonitorSpecs(cfg, [], { schedulerSeed: "test-seed" })).toEqual([]);
  });
});
