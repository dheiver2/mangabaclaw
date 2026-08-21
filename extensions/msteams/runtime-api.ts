// Private runtime barrel for the bundled Microsoft Teams extension.
// Keep this barrel thin and aligned with the local extension surface.

export { DEFAULT_ACCOUNT_ID } from "mangabaclaw/plugin-sdk/account-id";
export type { AllowlistMatch } from "mangabaclaw/plugin-sdk/allow-from";
export {
  mergeAllowlist,
  resolveAllowlistMatchSimple,
  summarizeMapping,
} from "mangabaclaw/plugin-sdk/allow-from";
export type {
  BaseProbeResult,
  ChannelDirectoryEntry,
  ChannelGroupContext,
  ChannelMessageActionName,
  ChannelOutboundAdapter,
} from "mangabaclaw/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "mangabaclaw/plugin-sdk/channel-core";
export { logTypingFailure } from "mangabaclaw/plugin-sdk/channel-outbound";
export { createChannelPairingController } from "mangabaclaw/plugin-sdk/channel-pairing";
export { resolveToolsBySender } from "mangabaclaw/plugin-sdk/channel-policy";
export { createChannelMessageReplyPipeline } from "mangabaclaw/plugin-sdk/channel-outbound";
export {
  PAIRING_APPROVED_MESSAGE,
  buildProbeChannelStatusSummary,
  createDefaultChannelRuntimeState,
} from "mangabaclaw/plugin-sdk/channel-status";
export {
  buildChannelKeyCandidates,
  normalizeChannelSlug,
  resolveChannelEntryMatchWithFallback,
  resolveNestedAllowlistDecision,
} from "mangabaclaw/plugin-sdk/channel-targets";
export type {
  GroupPolicy,
  GroupToolPolicyConfig,
  MSTeamsChannelConfig,
  MSTeamsCloudName,
  MSTeamsConfig,
  MSTeamsReplyStyle,
  MSTeamsTeamConfig,
  MarkdownTableMode,
  MangabaClawConfig,
} from "mangabaclaw/plugin-sdk/config-contracts";
export { isDangerousNameMatchingEnabled } from "mangabaclaw/plugin-sdk/dangerous-name-runtime";
export { resolveDefaultGroupPolicy } from "mangabaclaw/plugin-sdk/runtime-group-policy";
export { withFileLock } from "mangabaclaw/plugin-sdk/file-lock";
export { keepHttpServerTaskAlive } from "mangabaclaw/plugin-sdk/channel-outbound";
export {
  detectMime,
  extensionForMime,
  extractOriginalFilename,
  getFileExtension,
  resolveChannelMediaMaxBytes,
} from "mangabaclaw/plugin-sdk/media-runtime";
export { loadOutboundMediaFromUrl } from "mangabaclaw/plugin-sdk/outbound-media";
// Deprecated media-legacy-projection surface; the re-export stays until the
// compat record's removeAfter window expires (deleted in retirement PR 4).
export { buildMediaPayload } from "mangabaclaw/plugin-sdk/reply-payload";
export type { ReplyPayload } from "mangabaclaw/plugin-sdk/reply-payload";
export type { PluginRuntime } from "mangabaclaw/plugin-sdk/runtime-store";
export type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime";
export type { SsrFPolicy } from "mangabaclaw/plugin-sdk/ssrf-runtime";
export { fetchWithSsrFGuard } from "mangabaclaw/plugin-sdk/ssrf-runtime";
export { normalizeStringEntries } from "mangabaclaw/plugin-sdk/string-normalization-runtime";
export { chunkTextForOutbound } from "mangabaclaw/plugin-sdk/text-chunking";
export { DEFAULT_WEBHOOK_MAX_BODY_BYTES } from "mangabaclaw/plugin-sdk/webhook-ingress";
export { setMSTeamsRuntime } from "./src/runtime.js";
