import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";

// Reply completeness is process-local metadata. Keep it off config objects so
// frozen runtime snapshots and identity-keyed caches remain valid.
const replyConfigRuntimeModes = new WeakMap<MangabaClawConfig, "fast" | "full">();

export function markReplyConfigRuntimeMode<T extends MangabaClawConfig>(
  config: T,
  runtimeMode: "fast" | "full",
): T {
  replyConfigRuntimeModes.set(config, runtimeMode);
  return config;
}

export function isCompleteReplyConfig(config: unknown): config is MangabaClawConfig {
  return Boolean(
    config && typeof config === "object" && replyConfigRuntimeModes.has(config as MangabaClawConfig),
  );
}

export function usesFullReplyRuntime(config: unknown): boolean {
  if (!config || typeof config !== "object") {
    return false;
  }
  const mode = replyConfigRuntimeModes.get(config as MangabaClawConfig);
  return mode === "full";
}
