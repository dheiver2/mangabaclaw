// Private runtime barrel for the bundled Feishu extension.
// Keep this barrel thin and generic-only.

export type {
  AllowlistMatch,
  AnyAgentTool,
  BaseProbeResult,
  ChannelGroupContext,
  ChannelMessageActionName,
  ChannelMeta,
  ChannelOutboundAdapter,
  ChannelPlugin,
  HistoryEntry,
  MangabaClawConfig,
  MangabaClawPluginApi,
  OutboundIdentity,
  PluginRuntime,
  ReplyPayload,
} from "mangabaclaw/plugin-sdk/core";
export type { MangabaClawConfig as ClawdbotConfig } from "mangabaclaw/plugin-sdk/core";
export type RuntimeEnv = {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => void;
};
export type { GroupToolPolicyConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
  createActionGate,
  createDedupeCache,
} from "mangabaclaw/plugin-sdk/core";
export {
  PAIRING_APPROVED_MESSAGE,
  buildProbeChannelStatusSummary,
  createDefaultChannelRuntimeState,
} from "mangabaclaw/plugin-sdk/channel-status";
export { createChannelPairingController } from "mangabaclaw/plugin-sdk/channel-pairing";
export { createReplyPrefixContext } from "mangabaclaw/plugin-sdk/channel-outbound";
export {
  evaluateSupplementalContextVisibility,
  filterSupplementalContextItems,
  resolveChannelContextVisibilityMode,
} from "mangabaclaw/plugin-sdk/context-visibility-runtime";
export { getSessionEntry } from "mangabaclaw/plugin-sdk/session-store-runtime";
export { readJsonFileWithFallback } from "mangabaclaw/plugin-sdk/json-store";
export { normalizeAgentId } from "mangabaclaw/plugin-sdk/routing";
export { chunkTextForOutbound } from "mangabaclaw/plugin-sdk/text-chunking";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "mangabaclaw/plugin-sdk/webhook-ingress";
export { setFeishuRuntime } from "./src/runtime.js";
