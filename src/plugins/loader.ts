/** Stable public facade for plugin loading and runtime-registry resolution. */
import { loadMangabaClawPlugins } from "./loader-runtime-load.js";
import type { PluginLoadOptions } from "./loader-types.js";
export {
  clearPluginRegistryLoadCache,
  isPluginRegistryLoadInFlight,
  resolvePluginRegistryLoadCacheKey,
} from "./loader-cache.js";
export { loadMangabaClawPluginCliRegistry } from "./loader-cli-registry.js";
export {
  getRuntimePluginRegistryForLoadOptions,
  resolveCompatibleRuntimePluginRegistry,
  resolveRuntimePluginRegistry,
} from "./loader-runtime-registry.js";

/** Loads a caller-owned registry value without changing the process-wide active registry. */
export function loadPluginRegistryHandle(options: PluginLoadOptions = {}) {
  return loadMangabaClawPlugins({ ...options, activate: false });
}

/** Loads and installs the registry owned by a process composition root. */
export function loadAndActivateRootPluginRegistry(options: PluginLoadOptions = {}) {
  return loadMangabaClawPlugins({ ...options, activate: true });
}

export { loadMangabaClawPlugins };
export type { PluginLoadOptions };
