// Gateway runtime plugin config resolver.
// Applies plugin auto-enable rules against the active manifest snapshot.
import { applyPluginAutoEnable } from "../config/plugin-auto-enable.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { getCurrentPluginMetadataSnapshot } from "../plugins/current-plugin-metadata-snapshot.js";
import type { PluginMetadataSnapshot } from "../plugins/plugin-metadata-snapshot.types.js";

type CachedGatewayPluginConfig = {
  snapshot: PluginMetadataSnapshot;
  config: MangabaClawConfig;
};

const gatewayPluginConfigCache = new WeakMap<MangabaClawConfig, CachedGatewayPluginConfig>();

/** Resolves runtime config with plugin auto-enable applied for gateway startup/reload paths. */
export function resolveGatewayPluginConfig(params: { config: MangabaClawConfig }): MangabaClawConfig {
  const currentSnapshot = getCurrentPluginMetadataSnapshot({
    config: params.config,
    allowWorkspaceScopedSnapshot: true,
  });
  if (!currentSnapshot) {
    return applyPluginAutoEnable({
      config: params.config,
    }).config;
  }

  const cached = gatewayPluginConfigCache.get(params.config);
  if (cached?.snapshot === currentSnapshot) {
    return cached.config;
  }

  const config = applyPluginAutoEnable({
    config: params.config,
    manifestRegistry: currentSnapshot.manifestRegistry,
    discovery: currentSnapshot.discovery,
  }).config;
  gatewayPluginConfigCache.set(params.config, { snapshot: currentSnapshot, config });
  return config;
}
