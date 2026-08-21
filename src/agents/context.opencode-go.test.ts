import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveMemoryFlushContextWindowTokens } from "../auto-reply/reply/memory-flush.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { refreshContextWindowCache, resetContextWindowCacheForTest } from "./context.js";

describe("OpenCode Go context metadata", () => {
  let contextWindowTokens: number | undefined;
  let configuredModels: MangabaClawConfig["models"];

  beforeAll(async () => {
    const cfg: MangabaClawConfig = {
      agents: { defaults: { model: { primary: "opencode-go/deepseek-v4-pro" } } },
      plugins: { allow: ["opencode-go"] },
    };

    await refreshContextWindowCache(cfg);
    contextWindowTokens = resolveMemoryFlushContextWindowTokens({
      cfg,
      provider: "opencode-go",
      modelId: "deepseek-v4-pro",
    });
    configuredModels = cfg.models;
  });

  afterAll(() => {
    resetContextWindowCacheForTest();
  });

  it("warms the provider-owned context window without writing model config", () => {
    expect(contextWindowTokens).toBe(1_000_000);
    expect(configuredModels).toBeUndefined();
  });
});
