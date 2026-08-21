import { describe, expect, it } from "vitest";
import {
  resolveClawHubInstallSpecsForUpdateChannel,
  resolveNpmInstallSpecsForUpdateChannel,
} from "./install-channel-specs.js";

describe("resolveNpmInstallSpecsForUpdateChannel", () => {
  it.each(["@mangabaclaw/discord", "@mangabaclaw/discord@latest"])(
    "targets the exact core version for official extended-stable intent %s",
    (spec) => {
      expect(
        resolveNpmInstallSpecsForUpdateChannel({
          spec,
          updateChannel: "extended-stable",
          officialPackageName: "@mangabaclaw/discord",
          coreVersion: "2026.7.33",
        }),
      ).toEqual({
        installSpec: "@mangabaclaw/discord@2026.7.33",
        recordSpec: spec,
      });
    },
  );

  it.each([
    "@mangabaclaw/discord@2026.6.33",
    "@mangabaclaw/discord@next",
    "@mangabaclaw/discord@beta",
    "@mangabaclaw/discord@^2026.6.0",
    "https://registry.example.test/discord.tgz",
  ])("preserves explicit extended-stable intent %s", (spec) => {
    expect(
      resolveNpmInstallSpecsForUpdateChannel({
        spec,
        updateChannel: "extended-stable",
        officialPackageName: "@mangabaclaw/discord",
        coreVersion: "2026.7.33",
      }),
    ).toEqual({ installSpec: spec, recordSpec: spec });
  });

  it("does not rewrite a third-party package", () => {
    expect(
      resolveNpmInstallSpecsForUpdateChannel({
        spec: "@acme/discord",
        updateChannel: "extended-stable",
        officialPackageName: "@mangabaclaw/discord",
        coreVersion: "2026.7.33",
      }),
    ).toEqual({ installSpec: "@acme/discord", recordSpec: "@acme/discord" });
  });

  it("fails closed without an authoritative extended-stable core version", () => {
    expect(() =>
      resolveNpmInstallSpecsForUpdateChannel({
        spec: "@mangabaclaw/discord",
        updateChannel: "extended-stable",
        officialPackageName: "@mangabaclaw/discord",
      }),
    ).toThrow("requires an exact core version");
  });

  it("targets the exact core version for a stable version-bound plugin", () => {
    expect(
      resolveNpmInstallSpecsForUpdateChannel({
        spec: "@mangabaclaw/codex",
        updateChannel: "stable",
        officialPackageName: "@mangabaclaw/codex",
        coreVersion: "2026.8.1",
        versionBoundToCore: true,
      }),
    ).toEqual({
      installSpec: "@mangabaclaw/codex@2026.8.1",
      recordSpec: "@mangabaclaw/codex",
    });
  });

  it("preserves beta behavior for a version-bound plugin", () => {
    expect(
      resolveNpmInstallSpecsForUpdateChannel({
        spec: "@mangabaclaw/codex@latest",
        updateChannel: "beta",
        officialPackageName: "@mangabaclaw/codex",
        coreVersion: "2026.8.1-beta.3",
        versionBoundToCore: true,
      }),
    ).toEqual({
      installSpec: "@mangabaclaw/codex@beta",
      recordSpec: "@mangabaclaw/codex@latest",
      fallbackSpec: "@mangabaclaw/codex@latest",
      fallbackLabel: "@mangabaclaw/codex@beta",
    });
  });
});

describe("resolveClawHubInstallSpecsForUpdateChannel", () => {
  it("does not rewrite ClawHub on extended-stable", () => {
    expect(
      resolveClawHubInstallSpecsForUpdateChannel({
        spec: "clawhub:@mangabaclaw/discord",
        updateChannel: "extended-stable",
      }),
    ).toEqual({
      installSpec: "clawhub:@mangabaclaw/discord",
      recordSpec: "clawhub:@mangabaclaw/discord",
    });
  });
});
