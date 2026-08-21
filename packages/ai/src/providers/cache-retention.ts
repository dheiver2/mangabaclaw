import type { CacheRetention } from "../types.js";

/**
 * Resolve cache retention preference.
 * Defaults to "short" and uses MANGABACLAW_CACHE_RETENTION for backward compatibility.
 */
export function resolveCacheRetention(cacheRetention?: CacheRetention): CacheRetention {
  if (cacheRetention === "short" || cacheRetention === "long" || cacheRetention === "none") {
    return cacheRetention;
  }
  if (typeof process !== "undefined" && process.env.MANGABACLAW_CACHE_RETENTION === "long") {
    return "long";
  }
  return "short";
}
