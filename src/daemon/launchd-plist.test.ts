// Launchd plist parser tests cover label extraction shared by lifecycle and diagnostics.
import { describe, expect, it } from "vitest";
import { parseLaunchdPlistLabel } from "./launchd-plist.js";

describe("parseLaunchdPlistLabel", () => {
  it("decodes the XML entities accepted in launchd labels", () => {
    expect(
      parseLaunchdPlistLabel(
        "<plist><dict><key>Label</key><string>ai.mangabaclaw.a&amp;b</string></dict></plist>",
      ),
    ).toBe("ai.mangabaclaw.a&b");
  });

  it("returns null for missing or empty labels", () => {
    expect(parseLaunchdPlistLabel("<plist><dict/></plist>")).toBeNull();
    expect(
      parseLaunchdPlistLabel("<plist><dict><key>Label</key><string>  </string></dict></plist>"),
    ).toBeNull();
  });
});
