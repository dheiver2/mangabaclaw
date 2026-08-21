// Lobster API module exposes the plugin public contract.
export { definePluginEntry } from "mangabaclaw/plugin-sdk/core";
export type {
  AnyAgentTool,
  MangabaClawPluginApi,
  MangabaClawPluginToolContext,
  MangabaClawPluginToolFactory,
} from "mangabaclaw/plugin-sdk/core";
export {
  applyWindowsSpawnProgramPolicy,
  materializeWindowsSpawnProgram,
  resolveWindowsSpawnProgramCandidate,
} from "mangabaclaw/plugin-sdk/windows-spawn";
