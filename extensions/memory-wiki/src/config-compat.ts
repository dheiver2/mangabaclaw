// Memory Wiki helper module supports config compat behavior.
import { asNullableRecord } from "mangabaclaw/plugin-sdk/string-coerce-runtime";
import type { MangabaClawConfig } from "../api.js";

type LegacyConfigRule = {
  path: Array<string | number>;
  message: string;
  match: (value: unknown) => boolean;
};

function hasLegacyBridgeArtifactToggle(value: unknown): boolean {
  return Object.hasOwn(asNullableRecord(value) ?? {}, "readMemoryCore");
}

export const legacyConfigRules: LegacyConfigRule[] = [
  {
    path: ["plugins", "entries", "memory-wiki", "config", "bridge"],
    message:
      'plugins.entries.memory-wiki.config.bridge.readMemoryCore is legacy; use plugins.entries.memory-wiki.config.bridge.readMemoryArtifacts. Run "mangabaclaw doctor --fix".',
    match: hasLegacyBridgeArtifactToggle,
  },
];

export function migrateMemoryWikiLegacyConfig(config: MangabaClawConfig): {
  config: MangabaClawConfig;
  changes: string[];
} | null {
  const rawEntry = asNullableRecord(config.plugins?.entries?.["memory-wiki"]);
  const rawPluginConfig = asNullableRecord(rawEntry?.config);
  const rawBridge = asNullableRecord(rawPluginConfig?.bridge);
  if (!rawBridge || !hasLegacyBridgeArtifactToggle(rawBridge)) {
    return null;
  }

  const nextConfig = structuredClone(config);
  const nextPlugins = asNullableRecord(nextConfig.plugins) ?? {};
  nextConfig.plugins = nextPlugins;
  const nextEntries = asNullableRecord(nextPlugins.entries) ?? {};
  nextPlugins.entries = nextEntries;
  const nextEntry = asNullableRecord(nextEntries["memory-wiki"]) ?? {};
  nextEntries["memory-wiki"] = nextEntry;
  const nextPluginConfig = asNullableRecord(nextEntry.config) ?? {};
  nextEntry.config = nextPluginConfig;
  const nextBridge = asNullableRecord(nextPluginConfig.bridge) ?? {};
  nextPluginConfig.bridge = nextBridge;

  const legacyValue = nextBridge.readMemoryCore;
  const hasCanonical = Object.hasOwn(nextBridge, "readMemoryArtifacts");
  if (!hasCanonical) {
    nextBridge.readMemoryArtifacts = legacyValue;
  }
  delete nextBridge.readMemoryCore;

  return {
    config: nextConfig,
    changes: hasCanonical
      ? [
          "Removed legacy plugins.entries.memory-wiki.config.bridge.readMemoryCore; kept explicit plugins.entries.memory-wiki.config.bridge.readMemoryArtifacts.",
        ]
      : [
          "Moved plugins.entries.memory-wiki.config.bridge.readMemoryCore → plugins.entries.memory-wiki.config.bridge.readMemoryArtifacts.",
        ],
  };
}

export function normalizeCompatibilityConfig({ cfg }: { cfg: MangabaClawConfig }): {
  config: MangabaClawConfig;
  changes: string[];
} {
  return migrateMemoryWikiLegacyConfig(cfg) ?? { config: cfg, changes: [] };
}
