// Private runtime barrel for the bundled Nextcloud Talk extension.
// Keep this barrel thin and aligned with the local extension surface.

export type { AllowlistMatch } from "mangabaclaw/plugin-sdk/allow-from";
export type { ChannelGroupContext } from "mangabaclaw/plugin-sdk/channel-contract";
export { logInboundDrop } from "mangabaclaw/plugin-sdk/channel-inbound";
export { createChannelPairingController } from "mangabaclaw/plugin-sdk/channel-pairing";
export type {
  BlockStreamingCoalesceConfig,
  DmConfig,
  DmPolicy,
  GroupPolicy,
  GroupToolPolicyConfig,
  MangabaClawConfig,
} from "mangabaclaw/plugin-sdk/config-contracts";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "mangabaclaw/plugin-sdk/runtime-group-policy";
export { createChannelMessageReplyPipeline } from "mangabaclaw/plugin-sdk/channel-outbound";
export type { OutboundReplyPayload } from "mangabaclaw/plugin-sdk/reply-payload";
export { deliverFormattedTextWithAttachments } from "mangabaclaw/plugin-sdk/reply-payload";
export type { PluginRuntime } from "mangabaclaw/plugin-sdk/runtime-store";
export type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime";
export type { SecretInput } from "mangabaclaw/plugin-sdk/secret-input";
export { fetchWithSsrFGuard } from "mangabaclaw/plugin-sdk/ssrf-runtime";
export { setNextcloudTalkRuntime } from "./src/runtime.js";
