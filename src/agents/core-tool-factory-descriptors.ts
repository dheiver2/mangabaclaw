/**
 * Static identity for names that select core agent factory families before assembly.
 */

import { AUTOMATIONS_TOOL_NAME } from "./tools/automations-tool-name.js";

export type CoreToolFactoryFamily = "base-coding" | "shell" | "mangabaclaw";

type CoreToolFactoryDescriptor = {
  name: string;
  family: CoreToolFactoryFamily;
};

const CORE_TOOL_FACTORY_DESCRIPTORS = [
  { name: "edit", family: "base-coding" },
  { name: "read", family: "base-coding" },
  { name: "write", family: "base-coding" },
  { name: "apply_patch", family: "shell" },
  { name: "exec", family: "shell" },
  { name: "process", family: "shell" },
  { name: "agents_list", family: "mangabaclaw" },
  // Static factory identity only; runtime and tools.catalog apply the Swarm config gate.
  { name: "agents_wait", family: "mangabaclaw" },
  { name: "ask_user", family: "mangabaclaw" },
  { name: "mangabaclaw", family: "mangabaclaw" },
  { name: "computer", family: "mangabaclaw" },
  { name: "conversations_list", family: "mangabaclaw" },
  { name: "conversations_send", family: "mangabaclaw" },
  { name: "conversations_turn", family: "mangabaclaw" },
  { name: AUTOMATIONS_TOOL_NAME, family: "mangabaclaw" },
  { name: "screen", family: "mangabaclaw" },
  { name: "dashboard", family: "mangabaclaw" },
  { name: "gateway", family: "mangabaclaw" },
  { name: "get_goal", family: "mangabaclaw" },
  { name: "github_identity_status", family: "mangabaclaw" },
  { name: "github_publish", family: "mangabaclaw" },
  { name: "heartbeat_respond", family: "mangabaclaw" },
  { name: "view_image", family: "mangabaclaw" },
  { name: "image_generate", family: "mangabaclaw" },
  { name: "message", family: "mangabaclaw" },
  { name: "mobile_ui", family: "mangabaclaw" },
  { name: "music_generate", family: "mangabaclaw" },
  { name: "nodes", family: "mangabaclaw" },
  { name: "pdf", family: "mangabaclaw" },
  { name: "session_status", family: "mangabaclaw" },
  { name: "show_widget", family: "mangabaclaw" },
  { name: "progress_card", family: "mangabaclaw" },
  { name: "sessions", family: "mangabaclaw" },
  { name: "sessions_history", family: "mangabaclaw" },
  { name: "sessions_list", family: "mangabaclaw" },
  { name: "sessions_search", family: "mangabaclaw" },
  { name: "sessions_send", family: "mangabaclaw" },
  { name: "sessions_spawn", family: "mangabaclaw" },
  { name: "sessions_yield", family: "mangabaclaw" },
  { name: "structured_output", family: "mangabaclaw" },
  { name: "skill_workshop", family: "mangabaclaw" },
  { name: "suggest_task", family: "mangabaclaw" },
  { name: "create_goal", family: "mangabaclaw" },
  { name: "subagents", family: "mangabaclaw" },
  { name: "terminal", family: "mangabaclaw" },
  { name: "portal", family: "mangabaclaw" },
  { name: "transcripts", family: "mangabaclaw" },
  { name: "tts", family: "mangabaclaw" },
  { name: "update_goal", family: "mangabaclaw" },
  { name: "dismiss_task", family: "mangabaclaw" },
  { name: "video_generate", family: "mangabaclaw" },
  { name: "web_fetch", family: "mangabaclaw" },
  { name: "web_search", family: "mangabaclaw" },
] as const satisfies readonly CoreToolFactoryDescriptor[];

const CORE_TOOL_FACTORY_FAMILY_BY_NAME = new Map<string, CoreToolFactoryFamily>(
  CORE_TOOL_FACTORY_DESCRIPTORS.map(({ name, family }) => [name, family]),
);

export type MangabaClawCodingToolConstructionPlan = {
  includeBaseCodingTools: boolean;
  includeShellTools: boolean;
  includeChannelTools: boolean;
  includeMangabaClawTools: boolean;
  includePluginTools: boolean;
};

export function resolveCoreToolFactoryFamily(name: string): CoreToolFactoryFamily | undefined {
  return CORE_TOOL_FACTORY_FAMILY_BY_NAME.get(name);
}

/**
 * Core coding primitives (file + shell families). Tool-search compaction keeps
 * these directly visible: hiding them behind search adds a lookup round-trip to
 * nearly every coding turn.
 */
export function isCoreCodingSurfaceToolName(name: string): boolean {
  const family = CORE_TOOL_FACTORY_FAMILY_BY_NAME.get(name);
  return family === "base-coding" || family === "shell";
}
