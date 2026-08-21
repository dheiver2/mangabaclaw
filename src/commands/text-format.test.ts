// Text format tests cover command-facing shortening helpers.
import { describe, expect, it } from "vitest";
import { shortenText } from "./text-format.js";

describe("shortenText", () => {
  it("returns original text when it fits", () => {
    expect(shortenText("mangabaclaw", 16)).toBe("mangabaclaw");
  });

  it("truncates and appends ellipsis when over limit", () => {
    expect(shortenText("mangabaclaw-status-output", 10)).toBe("mangabaclaw-…");
  });

  it("returns an empty string for non-positive limits", () => {
    expect(shortenText("mangabaclaw", 0)).toBe("");
    expect(shortenText("mangabaclaw", -1)).toBe("");
  });

  it("counts multi-byte characters correctly", () => {
    expect(shortenText("hello🙂world", 7)).toBe("hello🙂…");
  });
});
