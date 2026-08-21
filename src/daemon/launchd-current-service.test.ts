// Launchd current service tests cover resolving active macOS service labels.
import { describe, expect, it } from "vitest";
import { isCurrentProcessLaunchdServiceLabel } from "./launchd-current-service.js";

describe("isCurrentProcessLaunchdServiceLabel", () => {
  it("matches launchd-provided service labels", () => {
    expect(
      isCurrentProcessLaunchdServiceLabel("ai.mangabaclaw.gateway", {
        LAUNCH_JOB_LABEL: "ai.mangabaclaw.gateway",
      }),
    ).toBe(true);
  });

  it("falls back to MangabaClaw service markers when XPC_SERVICE_NAME is inherited", () => {
    expect(
      isCurrentProcessLaunchdServiceLabel("ai.mangabaclaw.gateway", {
        XPC_SERVICE_NAME: "0",
        MANGABACLAW_SERVICE_MARKER: "mangabaclaw",
        MANGABACLAW_SERVICE_KIND: "gateway",
        MANGABACLAW_LAUNCHD_LABEL: "ai.mangabaclaw.gateway",
      }),
    ).toBe(true);
  });

  it("preserves label-only fallback when launchd exposes no label variables", () => {
    expect(
      isCurrentProcessLaunchdServiceLabel("ai.mangabaclaw.gateway", {
        MANGABACLAW_LAUNCHD_LABEL: "ai.mangabaclaw.gateway",
      }),
    ).toBe(true);
  });

  it("can require service markers for label-only fallback", () => {
    expect(
      isCurrentProcessLaunchdServiceLabel(
        "ai.mangabaclaw.gateway",
        {
          MANGABACLAW_LAUNCHD_LABEL: "ai.mangabaclaw.gateway",
        },
        { allowConfiguredLabelFallback: false },
      ),
    ).toBe(false);
  });

  it("does not treat unrelated inherited launchd labels as current services", () => {
    expect(
      isCurrentProcessLaunchdServiceLabel("ai.mangabaclaw.gateway", {
        XPC_SERVICE_NAME: "0",
        MANGABACLAW_LAUNCHD_LABEL: "ai.mangabaclaw.gateway",
      }),
    ).toBe(false);
  });
});
