// Discord tests cover agent control plugin behavior.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { maybeControlDiscordVoiceAgentRun } from "./agent-control.js";

const mocks = vi.hoisted(() => ({
  controlRealtimeVoiceAgentRun: vi.fn(),
  shouldAutoControlRealtimeVoiceAgentText: vi.fn(),
}));

vi.mock("mangabaclaw/plugin-sdk/realtime-voice", () => ({
  controlRealtimeVoiceAgentRun: mocks.controlRealtimeVoiceAgentRun,
  shouldAutoControlRealtimeVoiceAgentText: mocks.shouldAutoControlRealtimeVoiceAgentText,
}));

function createEntry() {
  return { route: { sessionKey: "discord:g1:c1" } } as Parameters<
    typeof maybeControlDiscordVoiceAgentRun
  >[0]["entry"];
}

describe("maybeControlDiscordVoiceAgentRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shouldAutoControlRealtimeVoiceAgentText.mockReturnValue(true);
  });

  it("falls back for inactive cancel-like phrases", async () => {
    const result = {
      ok: true,
      active: false,
      mode: "cancel",
      sessionKey: "discord:g1:c1",
      message: "There is no active MangabaClaw run to cancel.",
      speak: true,
      suppress: false,
    };
    mocks.controlRealtimeVoiceAgentRun.mockResolvedValue(result);

    await expect(
      maybeControlDiscordVoiceAgentRun({
        entry: createEntry(),
        text: "cancel my meeting tomorrow",
      }),
    ).resolves.toEqual({ handled: false, result });
  });

  it("handles active cancel requests", async () => {
    const result = {
      ok: true,
      active: true,
      mode: "cancel",
      sessionKey: "discord:g1:c1",
      message: "Cancelled the active MangabaClaw run.",
      speak: true,
      suppress: false,
    };
    mocks.controlRealtimeVoiceAgentRun.mockResolvedValue(result);

    await expect(
      maybeControlDiscordVoiceAgentRun({
        entry: createEntry(),
        text: "cancel that",
      }),
    ).resolves.toEqual({
      handled: true,
      result,
      speakText: "Cancelled the active MangabaClaw run.",
    });
  });

  it("ignores non-control phrases", async () => {
    mocks.shouldAutoControlRealtimeVoiceAgentText.mockReturnValue(false);

    await expect(
      maybeControlDiscordVoiceAgentRun({
        entry: createEntry(),
        text: "what is next",
      }),
    ).resolves.toEqual({ handled: false });
    expect(mocks.controlRealtimeVoiceAgentRun).not.toHaveBeenCalled();
  });
});
