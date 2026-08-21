// Voice Call tests cover realtime fast context plugin behavior.
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveRealtimeVoiceFastContextConsult: vi.fn(),
}));

vi.mock("mangabaclaw/plugin-sdk/realtime-voice", () => ({
  resolveRealtimeVoiceFastContextConsult: mocks.resolveRealtimeVoiceFastContextConsult,
}));

import { resolveRealtimeFastContextConsult } from "./realtime-fast-context.js";

const cfg = {} as MangabaClawConfig;
type VoiceCallRealtimeFastContextConfig = Parameters<
  typeof resolveRealtimeFastContextConsult
>[0]["config"];

function createFastContextConfig(
  overrides: Partial<VoiceCallRealtimeFastContextConfig> = {},
): VoiceCallRealtimeFastContextConfig {
  return {
    enabled: true,
    timeoutMs: 800,
    maxResults: 3,
    sources: ["memory", "sessions"],
    fallbackToConsult: false,
    ...overrides,
  };
}

function createLogger() {
  return {
    debug: vi.fn(),
    warn: vi.fn(),
  };
}

describe("resolveRealtimeFastContextConsult", () => {
  beforeEach(() => {
    mocks.resolveRealtimeVoiceFastContextConsult.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes voice-call labels into the SDK fast context resolver", async () => {
    const logger = createLogger();
    mocks.resolveRealtimeVoiceFastContextConsult.mockResolvedValue({ handled: false });

    await expect(
      resolveRealtimeFastContextConsult({
        cfg,
        agentId: "main",
        sessionKey: "voice:15550001234",
        config: createFastContextConfig({ fallbackToConsult: true }),
        args: { question: "What do you remember?" },
        logger,
      }),
    ).resolves.toEqual({ handled: false });

    expect(mocks.resolveRealtimeVoiceFastContextConsult).toHaveBeenCalledWith({
      cfg,
      agentId: "main",
      sessionKey: "voice:15550001234",
      config: createFastContextConfig({ fallbackToConsult: true }),
      args: { question: "What do you remember?" },
      logger,
      labels: {
        audienceLabel: "caller",
        contextName: "MangabaClaw memory or session context",
      },
    });
  });
});
