// Whatsapp API module exposes the plugin public contract.
export { resolveIdentityNamePrefix } from "mangabaclaw/plugin-sdk/agent-runtime";
export { formatInboundEnvelope } from "mangabaclaw/plugin-sdk/channel-inbound";
export { resolveInboundSessionEnvelopeContext } from "mangabaclaw/plugin-sdk/channel-inbound";
export { createChannelMessageReplyPipeline } from "mangabaclaw/plugin-sdk/channel-outbound";
export {
  isControlCommandMessage,
  shouldComputeCommandAuthorized,
} from "mangabaclaw/plugin-sdk/command-detection";
export { resolveChannelContextVisibilityMode } from "../config.runtime.js";
export { getAgentScopedMediaLocalRoots } from "mangabaclaw/plugin-sdk/media-runtime";
export type LoadConfigFn = typeof import("../config.runtime.js").getRuntimeConfig;
export {
  buildHistoryContextFromEntries,
  type HistoryEntry,
} from "mangabaclaw/plugin-sdk/reply-history";
export { resolveSendableOutboundReplyParts } from "mangabaclaw/plugin-sdk/reply-payload";
export {
  resolveChunkMode,
  resolveTextChunkLimit,
  type getReplyFromConfig,
  type ReplyPayload,
} from "mangabaclaw/plugin-sdk/reply-runtime";
export {
  resolveInboundLastRouteSessionKey,
  type resolveAgentRoute,
} from "mangabaclaw/plugin-sdk/routing";
export { logVerbose, shouldLogVerbose, type getChildLogger } from "mangabaclaw/plugin-sdk/runtime-env";
export { resolvePinnedMainDmOwnerFromAllowlist } from "mangabaclaw/plugin-sdk/security-runtime";
export { resolveMarkdownTableMode } from "mangabaclaw/plugin-sdk/markdown-table-runtime";
export { jidToE164, normalizeE164 } from "../../text-runtime.js";
