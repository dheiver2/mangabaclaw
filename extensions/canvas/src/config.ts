/**
 * Canvas plugin config parsing, enablement, and schema metadata.
 */
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { resolvePluginConfigObject } from "mangabaclaw/plugin-sdk/plugin-config-runtime";
import { isTruthyEnvValue } from "mangabaclaw/plugin-sdk/runtime-env";
import { asBoolean as readBoolean, isRecord } from "mangabaclaw/plugin-sdk/string-coerce-runtime";

/** Enablement for Canvas-owned document and renderer routes. */
export type CanvasHostConfig = {
  enabled?: boolean;
};

/** Canvas plugin configuration shape. */
export type CanvasPluginConfig = {
  host?: CanvasHostConfig;
};

type CanvasPluginConfigSchema = {
  parse: (value: unknown) => CanvasPluginConfig;
};

function parseCanvasHostConfig(value: unknown): CanvasHostConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const enabled = readBoolean(value.enabled);
  return enabled === undefined ? {} : { enabled };
}

/** Parses raw Canvas plugin config into a typed, normalized shape. */
export function parseCanvasPluginConfig(value: unknown): CanvasPluginConfig {
  if (!isRecord(value)) {
    return {};
  }
  const host = parseCanvasHostConfig(value.host);
  return host ? { host } : {};
}

/** Resolves Canvas route configuration from plugin-owned config. */
export function resolveCanvasHostConfig(params: {
  config?: MangabaClawConfig;
  pluginConfig?: Record<string, unknown>;
}): CanvasHostConfig {
  const pluginConfig =
    params.pluginConfig ?? resolvePluginConfigObject(params.config, "canvas") ?? {};
  const parsedPluginConfig = parseCanvasPluginConfig(pluginConfig);
  return parsedPluginConfig.host ?? {};
}

/** Returns whether Canvas-owned document and renderer routes should be active. */
export function isCanvasHostEnabled(config?: MangabaClawConfig): boolean {
  if (isTruthyEnvValue(process.env.MANGABACLAW_SKIP_CANVAS_HOST)) {
    return false;
  }
  return resolveCanvasHostConfig({ config }).enabled !== false;
}

/** Runtime config parser for Canvas plugin settings. */
export const canvasConfigSchema: CanvasPluginConfigSchema = {
  parse: parseCanvasPluginConfig,
};
