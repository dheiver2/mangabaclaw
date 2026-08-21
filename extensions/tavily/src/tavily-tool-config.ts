// Tavily helper module supports tavily tool config behavior.
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import type { MangabaClawPluginToolContext } from "mangabaclaw/plugin-sdk/plugin-entry";
import type { MangabaClawPluginApi } from "mangabaclaw/plugin-sdk/plugin-runtime";

export type TavilyToolConfigContext = Pick<
  MangabaClawPluginToolContext,
  "config" | "runtimeConfig" | "getRuntimeConfig"
>;

export function resolveTavilyToolConfig(
  api: MangabaClawPluginApi,
  ctx?: TavilyToolConfigContext,
): MangabaClawConfig {
  return ctx?.getRuntimeConfig?.() ?? ctx?.runtimeConfig ?? ctx?.config ?? api.config;
}
