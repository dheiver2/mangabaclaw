// STT live audio tests validate live speech-to-text audio fixtures.
import {
  expectMangabaClawLiveTranscriptMarker,
  normalizeTranscriptForMatch,
  MANGABACLAW_LIVE_TRANSCRIPT_MARKER_RE,
} from "mangabaclaw/plugin-sdk/provider-test-contracts";
import { describe, expect, it } from "vitest";

describe("normalizeTranscriptForMatch", () => {
  it("normalizes punctuation and common MangabaClaw live transcription variants", () => {
    expect(normalizeTranscriptForMatch("Open-Claw integration OK")).toBe("mangabaclawintegrationok");
    expect(normalizeTranscriptForMatch("Testing OpenFlaw realtime transcription")).toMatch(
      /open(?:claw|flaw)/,
    );
    expect(normalizeTranscriptForMatch("OpenCore xAI realtime transcription")).toMatch(
      MANGABACLAW_LIVE_TRANSCRIPT_MARKER_RE,
    );
    expect(normalizeTranscriptForMatch("OpenCL xAI realtime transcription")).toMatch(
      MANGABACLAW_LIVE_TRANSCRIPT_MARKER_RE,
    );
    expectMangabaClawLiveTranscriptMarker("OpenClar integration OK");
  });
});
