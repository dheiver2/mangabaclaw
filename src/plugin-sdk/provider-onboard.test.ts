import { describe, expect, it } from "vitest";
import {
  applyOpencodeZenModelDefault,
  createAliasOnlyPresetAppliers,
  OPENCODE_ZEN_DEFAULT_MODEL,
  resolveAgentModelPrimaryValue,
  type MangabaClawConfig,
} from "./provider-onboard.js";

function expectPrimaryModelChanged(
  applied: { changed: boolean; next: MangabaClawConfig },
  primary: string,
) {
  expect(applied.changed).toBe(true);
  expect(applied.next.agents?.defaults?.model).toEqual({ primary });
}

function expectConfigUnchanged(
  applied: { changed: boolean; next: MangabaClawConfig },
  cfg: MangabaClawConfig,
) {
  expect(applied.changed).toBe(false);
  expect(applied.next).toEqual(cfg);
}

describe("createAliasOnlyPresetAppliers", () => {
  const modelRef = "example/default";
  const appliers = createAliasOnlyPresetAppliers({ modelRef, alias: "Example" });

  it("adds only the alias entry in provider-only mode", () => {
    const cfg: MangabaClawConfig = {
      models: { mode: "merge", providers: {} },
      agents: { defaults: { models: { "other/model": { alias: "Other" } } } },
    };

    const result = appliers.applyProviderConfig(cfg);

    expect(result.models).toBe(cfg.models);
    expect(result.agents?.defaults?.model).toBeUndefined();
    expect(result.agents?.defaults?.models).toEqual({
      "other/model": { alias: "Other" },
      [modelRef]: { alias: "Example" },
    });
  });

  it("preserves entry fields and alias while replacing the primary", () => {
    const cfg: MangabaClawConfig = {
      agents: {
        defaults: {
          model: { primary: "old/model", fallbacks: ["fallback/model"] },
          models: { [modelRef]: { alias: "Custom", params: { temperature: 0.2 } } },
        },
      },
    };

    const result = appliers.applyConfig(cfg);

    expect(resolveAgentModelPrimaryValue(result.agents?.defaults?.model)).toBe(modelRef);
    expect(result.agents?.defaults?.model).toEqual({
      primary: modelRef,
      fallbacks: ["fallback/model"],
    });
    expect(result.agents?.defaults?.models?.[modelRef]).toEqual({
      alias: "Custom",
      params: { temperature: 0.2 },
    });
  });
});

describe("applyOpencodeZenModelDefault", () => {
  it("sets defaults when model is unset", () => {
    const cfg: MangabaClawConfig = { agents: { defaults: {} } };
    const applied = applyOpencodeZenModelDefault(cfg);
    expectPrimaryModelChanged(applied, OPENCODE_ZEN_DEFAULT_MODEL);
  });

  it("overrides existing models", () => {
    const cfg = {
      agents: { defaults: { model: "anthropic/claude-opus-4-6" } },
    } as MangabaClawConfig;
    const applied = applyOpencodeZenModelDefault(cfg);
    expectPrimaryModelChanged(applied, OPENCODE_ZEN_DEFAULT_MODEL);
  });

  it("no-ops when already legacy opencode-zen default", () => {
    const cfg = {
      agents: { defaults: { model: "opencode-zen/claude-opus-4-5" } },
    } as MangabaClawConfig;
    const applied = applyOpencodeZenModelDefault(cfg);
    expectConfigUnchanged(applied, cfg);
  });

  it("preserves fallbacks when setting primary", () => {
    const cfg: MangabaClawConfig = {
      agents: {
        defaults: {
          model: {
            primary: "anthropic/claude-opus-4-6",
            fallbacks: ["google/gemini-3-pro"],
          },
        },
      },
    };
    const applied = applyOpencodeZenModelDefault(cfg);
    expect(applied.changed).toBe(true);
    expect(applied.next.agents?.defaults?.model).toEqual({
      primary: OPENCODE_ZEN_DEFAULT_MODEL,
      fallbacks: ["google/gemini-3.1-pro-preview"],
    });
  });

  it("no-ops when already on the current default", () => {
    const cfg = {
      agents: { defaults: { model: OPENCODE_ZEN_DEFAULT_MODEL } },
    } as MangabaClawConfig;
    const applied = applyOpencodeZenModelDefault(cfg);
    expectConfigUnchanged(applied, cfg);
  });
});
