// Builds plugin activation context from config, discovery, and manifests.
import { applyPluginAutoEnable } from "../config/plugin-auto-enable.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { withBundledPluginEnablementCompat } from "./bundled-compat.js";
import {
  createPluginActivationSource,
  normalizePluginsConfig,
  type NormalizedPluginsConfig,
  type PluginActivationConfigSource,
} from "./config-state.js";
import { getCurrentPluginMetadataSnapshot } from "./current-plugin-metadata-snapshot.js";
import type { PluginDiscoveryResult } from "./discovery.js";
import type { PluginManifestRegistry } from "./manifest-registry.js";

type PluginActivationInputs = {
  rawConfig?: MangabaClawConfig;
  config?: MangabaClawConfig;
  normalized: NormalizedPluginsConfig;
  activationSourceConfig?: MangabaClawConfig;
  activationSource: PluginActivationConfigSource;
  autoEnabledReasons: Record<string, string[]>;
};

type PluginActivationParams = {
  rawConfig?: MangabaClawConfig;
  resolvedConfig?: MangabaClawConfig;
  autoEnabledReasons?: Record<string, string[]>;
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
  applyAutoEnable?: boolean;
  discovery?: PluginDiscoveryResult;
  manifestRegistry?: PluginManifestRegistry;
};

type BundledCompatActivationParams = PluginActivationParams & {
  onlyPluginIds?: readonly string[];
  resolveBundledPluginIds: (params: {
    config?: MangabaClawConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    onlyPluginIds?: readonly string[];
  }) => string[];
};

export function withActivatedPluginIds(params: {
  config?: MangabaClawConfig;
  pluginIds: readonly string[];
  overrideGlobalDisable?: boolean;
  overrideExplicitDisable?: boolean;
}): MangabaClawConfig | undefined {
  if (params.pluginIds.length === 0) {
    return params.config;
  }
  const originalAllow = params.config?.plugins?.allow ?? [];
  const useAllowlistDiscovery = originalAllow.length > 0;
  const originalAllowSet = useAllowlistDiscovery ? new Set(originalAllow) : undefined;
  const allow = new Set(originalAllow);
  const entries = {
    ...params.config?.plugins?.entries,
  };
  for (const pluginId of params.pluginIds) {
    const normalized = pluginId.trim();
    if (!normalized) {
      continue;
    }
    if (originalAllowSet && !originalAllowSet.has(normalized)) {
      continue;
    }
    allow.add(normalized);
    const existingEntry = entries[normalized];
    entries[normalized] = {
      ...existingEntry,
      enabled: existingEntry?.enabled !== false || params.overrideExplicitDisable === true,
    };
  }
  const forcePluginsEnabled =
    params.overrideGlobalDisable === true && params.config?.plugins?.enabled === false;
  return {
    ...params.config,
    plugins: {
      ...params.config?.plugins,
      ...(forcePluginsEnabled ? { enabled: true } : {}),
      ...(allow.size > 0 ? { allow: [...allow] } : {}),
      entries,
    },
  };
}

function applyPluginAutoEnableForActivation(params: {
  config: MangabaClawConfig;
  env: NodeJS.ProcessEnv;
  workspaceDir?: string;
  discovery?: PluginDiscoveryResult;
  manifestRegistry?: PluginManifestRegistry;
}) {
  const currentSnapshot = params.manifestRegistry
    ? undefined
    : getCurrentPluginMetadataSnapshot({
        config: params.config,
        env: params.env,
        workspaceDir: params.workspaceDir,
        allowWorkspaceScopedSnapshot: true,
      });
  const defaultDiscoverySnapshot =
    !params.manifestRegistry && normalizePluginsConfig(params.config.plugins).loadPaths.length === 0
      ? getCurrentPluginMetadataSnapshot({
          env: params.env,
          workspaceDir: params.workspaceDir,
          allowWorkspaceScopedSnapshot: true,
          requireDefaultDiscoveryContext: true,
        })
      : undefined;
  const currentManifestRegistry =
    params.manifestRegistry ??
    currentSnapshot?.manifestRegistry ??
    defaultDiscoverySnapshot?.manifestRegistry;
  return applyPluginAutoEnable({
    config: params.config,
    env: params.env,
    manifestRegistry: currentManifestRegistry,
    discovery:
      params.discovery ?? currentSnapshot?.discovery ?? defaultDiscoverySnapshot?.discovery,
  });
}

export function resolvePluginActivationInputs(
  params: PluginActivationParams,
): PluginActivationInputs {
  const env = params.env ?? process.env;
  const rawConfig = params.rawConfig ?? params.resolvedConfig;
  let resolvedConfig = params.resolvedConfig ?? params.rawConfig;
  let autoEnabledReasons = params.autoEnabledReasons;

  if (params.applyAutoEnable && rawConfig !== undefined) {
    const autoEnabled = applyPluginAutoEnableForActivation({
      config: rawConfig,
      env,
      workspaceDir: params.workspaceDir,
      discovery: params.discovery,
      manifestRegistry: params.manifestRegistry,
    });
    resolvedConfig = autoEnabled.config;
    autoEnabledReasons = autoEnabled.autoEnabledReasons;
  }

  return {
    rawConfig,
    config: resolvedConfig,
    normalized: normalizePluginsConfig(resolvedConfig?.plugins),
    activationSourceConfig: rawConfig,
    activationSource: createPluginActivationSource({
      config: rawConfig,
    }),
    autoEnabledReasons: autoEnabledReasons ?? {},
  };
}

export function resolveBundledCompatActivationInputs(
  params: BundledCompatActivationParams,
): PluginActivationInputs {
  const env = params.env ?? process.env;
  const snapshot = resolvePluginActivationInputs({
    rawConfig: params.rawConfig,
    resolvedConfig: params.resolvedConfig,
    autoEnabledReasons: params.autoEnabledReasons,
    env,
    workspaceDir: params.workspaceDir,
    applyAutoEnable: params.applyAutoEnable,
    discovery: params.discovery,
    manifestRegistry: params.manifestRegistry,
  });
  const bundledPluginIds = params.resolveBundledPluginIds({
    config: snapshot.config,
    workspaceDir: params.workspaceDir,
    env,
    onlyPluginIds: params.onlyPluginIds,
  });
  const config = withBundledPluginEnablementCompat({
    config: snapshot.config,
    pluginIds: bundledPluginIds,
  });

  return {
    ...snapshot,
    config,
    normalized: normalizePluginsConfig(config?.plugins),
  };
}
