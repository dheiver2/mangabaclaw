// Zalo plugin module implements runtime support behavior.
export type { ReplyPayload } from "mangabaclaw/plugin-sdk/reply-runtime";
export type { MangabaClawConfig, GroupPolicy } from "mangabaclaw/plugin-sdk/config-contracts";
export type { MarkdownTableMode } from "mangabaclaw/plugin-sdk/config-contracts";
export type { BaseTokenResolution } from "mangabaclaw/plugin-sdk/channel-contract";
export type {
  BaseProbeResult,
  ChannelAccountSnapshot,
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelStatusIssue,
} from "mangabaclaw/plugin-sdk/channel-contract";
export type { SecretInput } from "mangabaclaw/plugin-sdk/secret-input";
export type { ChannelPlugin, PluginRuntime, WizardPrompter } from "mangabaclaw/plugin-sdk/core";
export type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime";
export type { OutboundReplyPayload } from "mangabaclaw/plugin-sdk/reply-payload";
export {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
  createDedupeCache,
  formatPairingApproveHint,
  jsonResult,
  normalizeAccountId,
  readStringParam,
  resolveClientIp,
} from "mangabaclaw/plugin-sdk/core";
export {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  buildSingleChannelSecretPromptState,
  mergeAllowFromEntries,
  migrateBaseNameToDefaultAccount,
  promptSingleChannelSecretInput,
  runSingleChannelSecretStep,
  setTopLevelChannelDmPolicyWithAllowFrom,
} from "mangabaclaw/plugin-sdk/setup";
export {
  buildSecretInputSchema,
  hasConfiguredSecretInput,
  normalizeResolvedSecretInputString,
  normalizeSecretInputString,
} from "mangabaclaw/plugin-sdk/secret-input";
export {
  buildTokenChannelStatusSummary,
  PAIRING_APPROVED_MESSAGE,
} from "mangabaclaw/plugin-sdk/channel-status";
export { buildBaseAccountStatusSnapshot } from "mangabaclaw/plugin-sdk/status-helpers";
export { chunkTextForOutbound } from "mangabaclaw/plugin-sdk/text-chunking";
export {
  formatAllowFromLowercase,
  isNormalizedSenderAllowed,
} from "mangabaclaw/plugin-sdk/allow-from";
export { addWildcardAllowFrom } from "mangabaclaw/plugin-sdk/setup";
export { resolveOpenProviderRuntimeGroupPolicy } from "mangabaclaw/plugin-sdk/runtime-group-policy";
export {
  warnMissingProviderGroupPolicyFallbackOnce,
  resolveDefaultGroupPolicy,
} from "mangabaclaw/plugin-sdk/runtime-group-policy";
export { createChannelPairingController } from "mangabaclaw/plugin-sdk/channel-pairing";
export { createChannelMessageReplyPipeline } from "mangabaclaw/plugin-sdk/channel-outbound";
export { logTypingFailure } from "mangabaclaw/plugin-sdk/channel-feedback";
export {
  deliverTextOrMediaReply,
  isNumericTargetId,
  sendPayloadWithChunkedTextAndMedia,
} from "mangabaclaw/plugin-sdk/reply-payload";
export { waitForAbortSignal } from "mangabaclaw/plugin-sdk/runtime";
export {
  applyBasicWebhookRequestGuards,
  createFixedWindowRateLimiter,
  createWebhookAnomalyTracker,
  readJsonWebhookBodyOrReject,
  registerPluginHttpRoute,
  registerWebhookTarget,
  registerWebhookTargetWithPluginRoute,
  resolveWebhookPath,
  resolveWebhookTargetWithAuthOrRejectSync,
  WEBHOOK_ANOMALY_COUNTER_DEFAULTS,
  WEBHOOK_RATE_LIMIT_DEFAULTS,
  withResolvedWebhookRequestPipeline,
} from "mangabaclaw/plugin-sdk/webhook-ingress";
export type {
  RegisterWebhookPluginRouteOptions,
  RegisterWebhookTargetOptions,
} from "mangabaclaw/plugin-sdk/webhook-ingress";
