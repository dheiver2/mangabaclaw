// Matrix API module exposes the plugin public contract.
export {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "mangabaclaw/plugin-sdk/account-id";
export {
  createActionGate,
  jsonResult,
  readNumberParam,
  readPositiveIntegerParam,
  readReactionParams,
  readStringArrayParam,
  readStringParam,
  ToolAuthorizationError,
} from "mangabaclaw/plugin-sdk/channel-actions";
export { buildChannelConfigSchema } from "mangabaclaw/plugin-sdk/channel-config-schema";
export type { ChannelPlugin } from "mangabaclaw/plugin-sdk/channel-core";
export type {
  BaseProbeResult,
  ChannelDirectoryEntry,
  ChannelGroupContext,
  ChannelMessageActionAdapter,
  ChannelMessageActionContext,
  ChannelMessageActionName,
  ChannelMessageToolDiscovery,
  ChannelOutboundAdapter,
  ChannelResolveKind,
  ChannelResolveResult,
  ChannelToolSend,
} from "mangabaclaw/plugin-sdk/channel-contract";
export {
  formatLocationText,
  toLocationContext,
  type NormalizedLocation,
} from "mangabaclaw/plugin-sdk/channel-inbound";
export { logInboundDrop } from "mangabaclaw/plugin-sdk/channel-inbound";
export { logTypingFailure } from "mangabaclaw/plugin-sdk/channel-outbound";
export { resolveAckReaction } from "mangabaclaw/plugin-sdk/channel-feedback";
export type { ChannelSetupInput } from "mangabaclaw/plugin-sdk/setup";
export type {
  MangabaClawConfig,
  ContextVisibilityMode,
  DmPolicy,
  GroupPolicy,
} from "mangabaclaw/plugin-sdk/config-contracts";
export type { GroupToolPolicyConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export type { WizardPrompter } from "mangabaclaw/plugin-sdk/setup";
export type { SecretInput } from "mangabaclaw/plugin-sdk/secret-input";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "mangabaclaw/plugin-sdk/runtime-group-policy";
export {
  addWildcardAllowFrom,
  formatDocsLink,
  hasConfiguredSecretInput,
  mergeAllowFromEntries,
  moveSingleAccountChannelSectionToDefaultAccount,
  promptAccountId,
  promptChannelAccessConfig,
  splitSetupEntries,
} from "mangabaclaw/plugin-sdk/setup";
export type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime";
export {
  assertHttpUrlTargetsPrivateNetwork,
  closeDispatcher,
  createPinnedDispatcher,
  isPrivateOrLoopbackHost,
  resolvePinnedHostnameWithPolicy,
  ssrfPolicyFromDangerouslyAllowPrivateNetwork,
  type LookupFn,
  type SsrFPolicy,
} from "mangabaclaw/plugin-sdk/ssrf-runtime";
export {
  ensureConfiguredAcpBindingReady,
  resolveConfiguredAcpBindingRecord,
} from "mangabaclaw/plugin-sdk/acp-binding-runtime";
export {
  buildProbeChannelStatusSummary,
  collectStatusIssuesFromLastError,
  PAIRING_APPROVED_MESSAGE,
} from "mangabaclaw/plugin-sdk/channel-status";
export {
  getSessionBindingService,
  resolveThreadBindingIdleTimeoutMsForChannel,
  resolveThreadBindingMaxAgeMsForChannel,
} from "mangabaclaw/plugin-sdk/conversation-runtime";
export { resolveOutboundSendDep } from "mangabaclaw/plugin-sdk/channel-outbound";
export { resolveAgentIdFromSessionKey } from "mangabaclaw/plugin-sdk/routing";
export { chunkTextForOutbound } from "mangabaclaw/plugin-sdk/text-chunking";
export { createChannelMessageReplyPipeline } from "mangabaclaw/plugin-sdk/channel-outbound";
export { loadOutboundMediaFromUrl } from "mangabaclaw/plugin-sdk/outbound-media";
export { normalizePollInput, type PollInput } from "mangabaclaw/plugin-sdk/poll-runtime";
export { writeJsonFileAtomically } from "mangabaclaw/plugin-sdk/json-store";
export {
  buildChannelKeyCandidates,
  resolveChannelEntryMatch,
} from "mangabaclaw/plugin-sdk/channel-targets";
export { buildTimeoutAbortSignal } from "./matrix/sdk/timeout-abort-signal.js";
export { formatZonedTimestamp } from "mangabaclaw/plugin-sdk/time-runtime";
export type { PluginRuntime, RuntimeLogger } from "mangabaclaw/plugin-sdk/plugin-runtime";
export type { ReplyPayload } from "mangabaclaw/plugin-sdk/reply-runtime";
// resolveMatrixAccountStringValues already comes from the Matrix API barrel.
// Re-exporting auth-precedence here makes TS source loaders define the export twice.
