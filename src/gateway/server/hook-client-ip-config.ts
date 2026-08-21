// Hook client-IP config adapts gateway trusted-proxy settings for hook request handling.
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import type { HookClientIpConfig } from "./hooks-request-handler.js";

/**
 * Adapts gateway network trust config to the hooks HTTP request handler.
 */
export function resolveHookClientIpConfig(cfg: MangabaClawConfig): HookClientIpConfig {
  return {
    trustedProxies: cfg.gateway?.trustedProxies,
    allowRealIpFallback: cfg.gateway?.allowRealIpFallback === true,
  };
}
