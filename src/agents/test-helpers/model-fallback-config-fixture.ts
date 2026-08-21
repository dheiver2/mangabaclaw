/**
 * Model fallback config fixture.
 *
 * Builds a minimal config with primary and fallback models for model-selection tests.
 */
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";

export function makeModelFallbackCfg(overrides: Partial<MangabaClawConfig> = {}): MangabaClawConfig {
  return {
    agents: {
      defaults: {
        model: {
          primary: "openai/gpt-4.1-mini",
          fallbacks: ["anthropic/claude-haiku-3-5"],
        },
      },
    },
    ...overrides,
  } as MangabaClawConfig;
}
