// Private runtime barrel for the bundled Google Chat extension.
// Keep this barrel thin and avoid broad plugin-sdk surfaces during bootstrap.

export { DEFAULT_ACCOUNT_ID } from "mangabaclaw/plugin-sdk/account-id";
export {
  createActionGate,
  jsonResult,
  readNumberParam,
  readReactionParams,
  readStringParam,
} from "mangabaclaw/plugin-sdk/channel-actions";
export { buildChannelConfigSchema, GoogleChatConfigSchema } from "./config-api.js";
export type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelStatusIssue,
} from "mangabaclaw/plugin-sdk/channel-contract";
export { missingTargetError } from "mangabaclaw/plugin-sdk/channel-feedback";
export {
  createAccountStatusSink,
  runPassiveAccountLifecycle,
} from "mangabaclaw/plugin-sdk/channel-outbound";
export { createChannelPairingController } from "mangabaclaw/plugin-sdk/channel-pairing";
export { createChannelMessageReplyPipeline } from "mangabaclaw/plugin-sdk/channel-outbound";
export { PAIRING_APPROVED_MESSAGE } from "mangabaclaw/plugin-sdk/channel-status";
export { chunkTextForOutbound } from "mangabaclaw/plugin-sdk/text-chunking";
export type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "mangabaclaw/plugin-sdk/runtime-group-policy";
export { isDangerousNameMatchingEnabled } from "mangabaclaw/plugin-sdk/dangerous-name-runtime";
export type { PluginRuntime } from "mangabaclaw/plugin-sdk/runtime-store";
export { fetchWithSsrFGuard } from "mangabaclaw/plugin-sdk/ssrf-runtime";
export type {
  GoogleChatAccountConfig,
  GoogleChatConfig,
} from "mangabaclaw/plugin-sdk/config-contracts";
export { extractToolSend } from "mangabaclaw/plugin-sdk/tool-send";
export { resolveInboundMentionDecision } from "mangabaclaw/plugin-sdk/channel-inbound";
export { resolveWebhookPath } from "mangabaclaw/plugin-sdk/webhook-ingress";
export {
  registerWebhookTargetWithPluginRoute,
  resolveWebhookTargetWithAuthOrReject,
  withResolvedWebhookRequestPipeline,
} from "mangabaclaw/plugin-sdk/webhook-targets";
export {
  createWebhookInFlightLimiter,
  readJsonWebhookBodyOrReject,
  type WebhookInFlightLimiter,
} from "mangabaclaw/plugin-sdk/webhook-request-guards";
export { setGoogleChatRuntime } from "./src/runtime.js";
