import { describe, expect, it } from "vitest";
import type { BundledPluginSource } from "./bundled-sources.js";
import { isMangabaClawTrustedPluginInstallSpec } from "./install-provenance.js";

const bundledSources = new Map<string, BundledPluginSource>([
  [
    "discord",
    {
      pluginId: "discord",
      localPath: "/opt/mangabaclaw/extensions/discord",
      npmSpec: "@mangabaclaw/discord",
    },
  ],
]);

describe("plugin install provenance", () => {
  it.each([
    "discord",
    "@mangabaclaw/discord",
    "npm:@mangabaclaw/discord",
    "/opt/mangabaclaw/extensions/discord",
    "brave",
    "npm:@mangabaclaw/brave-plugin",
    "clawhub:mangabaclaw-demo",
  ])("trusts MangabaClaw-owned install source %s", (spec) => {
    expect(isMangabaClawTrustedPluginInstallSpec(spec, bundledSources)).toBe(true);
  });

  it.each(["npm:discord", "npm:@example/plugin", "/tmp/example-plugin"])(
    "keeps arbitrary install source %s untrusted",
    (spec) => {
      expect(isMangabaClawTrustedPluginInstallSpec(spec, bundledSources)).toBe(false);
    },
  );
});
