// Fallback configuration tests pin how embedded runs detect model fallback
// availability from explicit overrides versus normal agent config.
import { describe, expect, it } from "vitest";
import type { MangabaClawConfig } from "../../../config/types.mangabaclaw.js";
import { hasEmbeddedRunConfiguredModelFallbacks } from "./fallbacks.js";

describe("hasEmbeddedRunConfiguredModelFallbacks", () => {
  it("uses explicit non-empty modelFallbacksOverride as configured", () => {
    expect(
      hasEmbeddedRunConfiguredModelFallbacks({
        cfg: {},
        modelFallbacksOverride: ["openai/gpt-5.4"],
      }),
    ).toBe(true);
  });

  it("treats explicit empty modelFallbacksOverride as disabling fallbacks", () => {
    // An explicit empty override is a caller decision, not a request to fall
    // back to defaults from the persisted MangabaClaw config.
    const cfg: MangabaClawConfig = {
      agents: {
        defaults: {
          model: {
            fallbacks: ["openai/gpt-5.4"],
          },
        },
      },
    };
    expect(
      hasEmbeddedRunConfiguredModelFallbacks({
        cfg,
        modelFallbacksOverride: [],
      }),
    ).toBe(false);
  });

  it("falls back to normal agent/default model fallback config when no override is provided", () => {
    const cfg: MangabaClawConfig = {
      agents: {
        defaults: {
          model: {
            fallbacks: ["openai/gpt-5.4"],
          },
        },
      },
    };
    expect(hasEmbeddedRunConfiguredModelFallbacks({ cfg, agentId: "main" })).toBe(true);
  });
});
