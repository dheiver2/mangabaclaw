// Focused runtime contract for memory plugin config/state/helpers.

export type { AnyAgentTool } from "./host/mangabaclaw-runtime-agent.js";
export { resolveCronStyleNow } from "./host/mangabaclaw-runtime-agent.js";
export { DEFAULT_AGENT_COMPACTION_RESERVE_TOKENS_FLOOR } from "./host/mangabaclaw-runtime-agent.js";
export { resolveDefaultAgentId, resolveSessionAgentId } from "./host/mangabaclaw-runtime-agent.js";
export { resolveMemorySearchConfig } from "./host/mangabaclaw-runtime-agent.js";
export {
  asToolParamsRecord,
  jsonResult,
  readNumberParam,
  readStringParam,
} from "./host/mangabaclaw-runtime-agent.js";
export { SILENT_REPLY_TOKEN } from "./host/mangabaclaw-runtime-session.js";
export { parseNonNegativeByteSize } from "./host/mangabaclaw-runtime-config.js";
export {
  getRuntimeConfig,
  /** @deprecated Use getRuntimeConfig(), or pass the already loaded config through the call path. */
  loadConfig,
} from "./host/mangabaclaw-runtime-config.js";
export { resolveStateDir } from "./host/mangabaclaw-runtime-config.js";
export { resolveSessionTranscriptsDirForAgent } from "./host/mangabaclaw-runtime-config.js";
export { emptyPluginConfigSchema } from "./host/mangabaclaw-runtime-memory.js";
export {
  buildActiveMemoryPromptSection,
  getMemoryCapabilityRegistration,
  listActiveMemoryPublicArtifacts,
} from "./host/mangabaclaw-runtime-memory.js";
export { parseAgentSessionKey } from "./host/mangabaclaw-runtime-agent.js";
export type { MangabaClawConfig } from "./host/mangabaclaw-runtime-config.js";
export type { MemoryCitationsMode } from "./host/mangabaclaw-runtime-config.js";
export type {
  MemoryFlushPlan,
  MemoryFlushPlanResolver,
  MemoryPluginCapability,
  MemoryPluginPublicArtifact,
  MemoryPluginPublicArtifactsProvider,
  MemoryPluginRuntime,
  MemoryPromptSectionBuilder,
} from "./host/mangabaclaw-runtime-memory.js";
export type { MangabaClawPluginApi } from "./host/mangabaclaw-runtime-memory.js";
