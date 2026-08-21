// Real workspace contract for memory engine foundation concerns.

export {
  resolveAgentContextLimits,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
  resolveSessionAgentId,
} from "./host/mangabaclaw-runtime-agent.js";
export {
  resolveMemorySearchConfig,
  resolveMemorySearchSyncConfig,
  type ResolvedMemorySearchConfig,
  type ResolvedMemorySearchSyncConfig,
} from "./host/mangabaclaw-runtime-agent.js";
export { parseDurationMs } from "./host/mangabaclaw-runtime-config.js";
export { loadConfig } from "./host/mangabaclaw-runtime-config.js";
export { resolveStateDir } from "./host/mangabaclaw-runtime-config.js";
export { resolveSessionTranscriptsDirForAgent } from "./host/mangabaclaw-runtime-config.js";
export {
  hasConfiguredSecretInput,
  normalizeResolvedSecretInputString,
} from "./host/mangabaclaw-runtime-config.js";
export { root } from "./host/mangabaclaw-runtime-io.js";
export { isPathInside } from "./host/fs-utils.js";
export { createSubsystemLogger } from "./host/mangabaclaw-runtime-io.js";
export { detectMime } from "./host/mangabaclaw-runtime-io.js";
export { resolveGlobalSingleton } from "./host/mangabaclaw-runtime-io.js";
export { onSessionTranscriptUpdate } from "./host/mangabaclaw-runtime-session.js";
export { splitShellArgs } from "./host/mangabaclaw-runtime-io.js";
export { runTasksWithConcurrency } from "./host/mangabaclaw-runtime-io.js";
export {
  shortenHomeInString,
  shortenHomePath,
  resolveUserPath,
  truncateUtf16Safe,
} from "./host/mangabaclaw-runtime-io.js";
export type { MangabaClawConfig } from "./host/mangabaclaw-runtime-config.js";
export type { SecretInput } from "./host/mangabaclaw-runtime-config.js";
export type { MemoryCitationsMode } from "./host/mangabaclaw-runtime-config.js";
export type { MemorySearchConfig } from "./host/mangabaclaw-runtime-config.js";
