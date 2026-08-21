// Diffs API module exposes the plugin public contract.
export type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export {
  definePluginEntry,
  type AnyAgentTool,
  type MangabaClawPluginApi,
  type MangabaClawPluginConfigSchema,
  type MangabaClawPluginToolContext,
  type PluginLogger,
} from "mangabaclaw/plugin-sdk/plugin-entry";
export { resolvePreferredMangabaClawTmpDir } from "mangabaclaw/plugin-sdk/temp-path";
