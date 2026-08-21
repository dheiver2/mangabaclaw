// Private runtime barrel for the bundled IRC extension.
// Keep this barrel thin and generic-only.

export type { BaseProbeResult } from "mangabaclaw/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "mangabaclaw/plugin-sdk/channel-core";
export type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export type { PluginRuntime } from "mangabaclaw/plugin-sdk/runtime-store";
export type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime";
export type {
  BlockStreamingCoalesceConfig,
  DmConfig,
  DmPolicy,
  GroupPolicy,
  GroupToolPolicyBySenderConfig,
  GroupToolPolicyConfig,
  MarkdownConfig,
} from "mangabaclaw/plugin-sdk/config-contracts";
export type { OutboundReplyPayload } from "mangabaclaw/plugin-sdk/reply-payload";
export { DEFAULT_ACCOUNT_ID } from "mangabaclaw/plugin-sdk/account-id";
export { buildChannelConfigSchema } from "mangabaclaw/plugin-sdk/channel-config-schema";
export {
  PAIRING_APPROVED_MESSAGE,
  buildBaseChannelStatusSummary,
} from "mangabaclaw/plugin-sdk/channel-status";
export { createChannelPairingController } from "mangabaclaw/plugin-sdk/channel-pairing";
export { createAccountStatusSink } from "mangabaclaw/plugin-sdk/channel-outbound";
export { resolveControlCommandGate } from "mangabaclaw/plugin-sdk/command-auth-native";
export { createChannelMessageReplyPipeline } from "mangabaclaw/plugin-sdk/channel-outbound";
export { chunkTextForOutbound } from "mangabaclaw/plugin-sdk/text-chunking";
export {
  deliverFormattedTextWithAttachments,
  formatTextWithAttachmentLinks,
  resolveOutboundMediaUrls,
} from "mangabaclaw/plugin-sdk/reply-payload";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "mangabaclaw/plugin-sdk/runtime-group-policy";
export { isDangerousNameMatchingEnabled } from "mangabaclaw/plugin-sdk/dangerous-name-runtime";
export { logInboundDrop } from "mangabaclaw/plugin-sdk/channel-inbound";
