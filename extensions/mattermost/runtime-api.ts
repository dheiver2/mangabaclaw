// Private runtime barrel for the bundled Mattermost extension.
// Keep this barrel thin and generic-only.

export type {
  BaseProbeResult,
  ChannelAccountSnapshot,
  ChannelDirectoryEntry,
  ChannelGroupContext,
  ChannelMessageActionName,
  ChannelPlugin,
  ChatType,
  HistoryEntry,
  MangabaClawConfig,
  MangabaClawPluginApi,
  PluginRuntime,
} from "mangabaclaw/plugin-sdk/core";
export type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime";
export type { ReplyPayload } from "mangabaclaw/plugin-sdk/reply-runtime";
export type { ModelsProviderData } from "mangabaclaw/plugin-sdk/models-provider-runtime";
export type {
  BlockStreamingCoalesceConfig,
  DmPolicy,
  GroupPolicy,
} from "mangabaclaw/plugin-sdk/config-contracts";
export {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
  createDedupeCache,
  parseStrictPositiveInteger,
  resolveClientIp,
  isTrustedProxyAddress,
} from "mangabaclaw/plugin-sdk/core";
export { buildComputedAccountStatusSnapshot } from "mangabaclaw/plugin-sdk/channel-status";
export { createAccountStatusSink } from "mangabaclaw/plugin-sdk/channel-outbound";
export {
  listSkillCommandsForAgents,
  resolveControlCommandGate,
  resolveStoredModelOverride,
} from "mangabaclaw/plugin-sdk/command-auth-native";
export { buildModelsProviderData } from "mangabaclaw/plugin-sdk/models-provider-runtime";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "mangabaclaw/plugin-sdk/runtime-group-policy";
export { isDangerousNameMatchingEnabled } from "mangabaclaw/plugin-sdk/dangerous-name-runtime";
export { resolveStorePath } from "mangabaclaw/plugin-sdk/session-store-runtime";
export { formatInboundFromLabel } from "mangabaclaw/plugin-sdk/channel-inbound";
export { logInboundDrop } from "mangabaclaw/plugin-sdk/channel-inbound";
export { createChannelPairingController } from "mangabaclaw/plugin-sdk/channel-pairing";
export { createChannelMessageReplyPipeline } from "mangabaclaw/plugin-sdk/channel-outbound";
export { logTypingFailure } from "mangabaclaw/plugin-sdk/channel-feedback";
export { loadOutboundMediaFromUrl } from "mangabaclaw/plugin-sdk/outbound-media";
export { rawDataToString } from "mangabaclaw/plugin-sdk/webhook-ingress";
export { chunkTextForOutbound } from "mangabaclaw/plugin-sdk/text-chunking";
// Legacy map-helper exports stay for older plugin consumers. New message-turn
// code should use createChannelHistoryWindow.
export {
  DEFAULT_GROUP_HISTORY_LIMIT,
  createChannelHistoryWindow,
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  recordPendingHistoryEntryIfEnabled,
} from "mangabaclaw/plugin-sdk/reply-history";
export { normalizeAccountId, resolveThreadSessionKeys } from "mangabaclaw/plugin-sdk/routing";
export { resolveAllowlistMatchSimple } from "mangabaclaw/plugin-sdk/allow-from";
export { registerPluginHttpRoute } from "mangabaclaw/plugin-sdk/webhook-targets";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
} from "mangabaclaw/plugin-sdk/webhook-ingress";
export {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  migrateBaseNameToDefaultAccount,
} from "mangabaclaw/plugin-sdk/setup";
export {
  getAgentScopedMediaLocalRoots,
  resolveChannelMediaMaxBytes,
} from "mangabaclaw/plugin-sdk/media-runtime";
export { normalizeProviderId } from "mangabaclaw/plugin-sdk/provider-model-shared";
export { setMattermostRuntime } from "./src/runtime.js";
