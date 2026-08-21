import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import { markReplyConfigRuntimeMode } from "./reply-config-runtime-mode.js";

export function markCompleteReplyConfig<T extends MangabaClawConfig>(
  config: T,
  options?: { runtimeMode?: "fast" | "full" },
): T {
  return markReplyConfigRuntimeMode(config, options?.runtimeMode ?? "fast");
}

export function withFastReplyConfig<T extends MangabaClawConfig>(config: T): T {
  return markCompleteReplyConfig(config);
}
