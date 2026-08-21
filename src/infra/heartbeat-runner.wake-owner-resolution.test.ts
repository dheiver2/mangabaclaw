import { describe, expect, it } from "vitest";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { withMangabaClawTestState } from "../test-utils/mangabaclaw-test-state.js";
import { runHeartbeatOnce } from "./heartbeat-runner.js";

describe("heartbeat wake owner resolution", () => {
  it("admits a scheduled tick for the configured system heartbeat owner", async () => {
    await withMangabaClawTestState({ label: "heartbeat-system-owner" }, async () => {
      const cfg = {
        agents: {
          ownership: "explicit",
          entries: { ops: {}, main: {} },
          defaults: { systemAgent: { agentId: "ops" } },
        },
      } as MangabaClawConfig;

      const result = await runHeartbeatOnce({
        cfg,
        agentId: "ops",
        source: "interval",
        intent: "scheduled",
        reason: "interval",
        deps: { getQueueSize: () => 0, nowMs: () => 0 },
      });

      expect(result).not.toEqual({ status: "skipped", reason: "disabled" });
    });
  });
});
