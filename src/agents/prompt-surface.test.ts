// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildMangabaClawToolFallbackText } from "./prompt-surface.js";

describe("buildMangabaClawToolFallbackText", () => {
  it("does not invent tool names when the structured list is unavailable", () => {
    const text = buildMangabaClawToolFallbackText({
      surface: "mangabaclaw_main",
    });

    expect(text).toContain("Use only exposed tools");
    expect(text).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
  });
});
