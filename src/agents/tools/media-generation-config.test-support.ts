// Test-only bridge that feeds legacy fixture values through the canonical mediaModels owner.
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";

type MediaCapability = "image" | "music" | "video";
type LegacyMediaModelKey = "imageGenerationModel" | "musicGenerationModel" | "videoGenerationModel";

export function canonicalizeMediaGenerationTestConfig(
  config: MangabaClawConfig,
  capability: MediaCapability,
  legacyKey: LegacyMediaModelKey,
): MangabaClawConfig {
  const defaults = config.agents?.defaults as
    | (NonNullable<MangabaClawConfig["agents"]>["defaults"] & Record<string, unknown>)
    | undefined;
  const legacyValue = defaults?.[legacyKey];
  if (legacyValue === undefined || defaults?.mediaModels?.[capability] !== undefined) {
    return config;
  }
  return {
    ...config,
    agents: {
      ...config.agents,
      defaults: {
        ...defaults,
        mediaModels: { ...defaults?.mediaModels, [capability]: legacyValue },
      },
    },
  };
}
