// Narrow Matrix monitor helper seam.
// Keep monitor internals off the broad package runtime-api barrel so monitor
// tests and shared workers do not pull unrelated Matrix helper surfaces.

export type { NormalizedLocation } from "mangabaclaw/plugin-sdk/channel-inbound";
export type { PluginRuntime, RuntimeLogger } from "mangabaclaw/plugin-sdk/plugin-runtime";
export type { BlockReplyContext, ReplyPayload } from "mangabaclaw/plugin-sdk/reply-runtime";
export type { MarkdownTableMode, MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime";
export {
  addAllowlistUserEntriesFromConfigEntry,
  buildAllowlistResolutionSummary,
  canonicalizeAllowlistWithResolvedIds,
  patchAllowlistUsersInConfigEntries,
  summarizeMapping,
} from "mangabaclaw/plugin-sdk/allow-from";
export {
  createReplyPrefixOptions,
  createTypingCallbacks,
} from "mangabaclaw/plugin-sdk/channel-outbound";
export { formatLocationText, toLocationContext } from "mangabaclaw/plugin-sdk/channel-inbound";
export { getAgentScopedMediaLocalRoots } from "mangabaclaw/plugin-sdk/media-local-roots";
export { logInboundDrop } from "mangabaclaw/plugin-sdk/channel-inbound";
export { logTypingFailure } from "mangabaclaw/plugin-sdk/channel-outbound";
export { buildChannelKeyCandidates } from "mangabaclaw/plugin-sdk/channel-targets";
