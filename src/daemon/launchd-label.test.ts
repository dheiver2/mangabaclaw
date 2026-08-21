// Launchd label tests keep lifecycle, handoff, update, and discovery resolution aligned.
import { describe, expect, it } from "vitest";
import { resolveLaunchAgentLabel } from "./launchd-label.js";

describe("resolveLaunchAgentLabel", () => {
  it("resolves default, profile, and explicit labels", () => {
    expect(resolveLaunchAgentLabel()).toBe("ai.mangabaclaw.gateway");
    expect(resolveLaunchAgentLabel({ MANGABACLAW_PROFILE: "work" })).toBe("ai.mangabaclaw.work");
    expect(
      resolveLaunchAgentLabel({
        MANGABACLAW_PROFILE: "work",
        MANGABACLAW_LAUNCHD_LABEL: "com.example.gateway",
      }),
    ).toBe("com.example.gateway");
  });

  it("rejects labels that cannot be passed safely to launchd", () => {
    expect(() =>
      resolveLaunchAgentLabel({ MANGABACLAW_LAUNCHD_LABEL: "ai.mangabaclaw.$(echo injected)" }),
    ).toThrow("Invalid launchd label");
  });
});
