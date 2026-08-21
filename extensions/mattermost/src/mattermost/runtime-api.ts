// Mattermost API module exposes the plugin public contract.
export type {
  BaseProbeResult,
  ChannelAccountSnapshot,
  ChannelDirectoryEntry,
  ChatType,
  HistoryEntry,
  MangabaClawConfig,
  MangabaClawPluginApi,
  ReplyPayload,
} from "mangabaclaw/plugin-sdk/core";
export type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime";
export { resolveAllowlistMatchSimple } from "mangabaclaw/plugin-sdk/allow-from";
export { logInboundDrop } from "mangabaclaw/plugin-sdk/channel-inbound";
export { createChannelPairingController } from "mangabaclaw/plugin-sdk/channel-pairing";
export { createChannelMessageReplyPipeline } from "mangabaclaw/plugin-sdk/channel-outbound";
export { logTypingFailure } from "mangabaclaw/plugin-sdk/channel-feedback";
export { listSkillCommandsForAgents } from "mangabaclaw/plugin-sdk/command-auth-native";
export { buildModelsProviderData } from "mangabaclaw/plugin-sdk/models-provider-runtime";
export { isDangerousNameMatchingEnabled } from "mangabaclaw/plugin-sdk/dangerous-name-runtime";
export {
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "mangabaclaw/plugin-sdk/runtime-group-policy";
export { resolveChannelMediaMaxBytes } from "mangabaclaw/plugin-sdk/media-runtime";
export { loadOutboundMediaFromUrl } from "mangabaclaw/plugin-sdk/outbound-media";
// Legacy map-helper exports stay for older plugin consumers. New message-turn
// code should use createChannelHistoryWindow.
export {
  DEFAULT_GROUP_HISTORY_LIMIT,
  createChannelHistoryWindow,
} from "mangabaclaw/plugin-sdk/reply-history";
export { registerPluginHttpRoute } from "mangabaclaw/plugin-sdk/webhook-targets";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
} from "mangabaclaw/plugin-sdk/webhook-ingress";
export { isTrustedProxyAddress, resolveClientIp } from "mangabaclaw/plugin-sdk/core";
