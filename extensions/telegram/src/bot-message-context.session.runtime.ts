// Telegram plugin module implements bot message context.session behavior.
export { buildChannelInboundEventContext } from "mangabaclaw/plugin-sdk/channel-inbound";
export {
  readAmbientTranscriptWatermark,
  readSessionUpdatedAt,
  resolveAmbientTranscriptWatermarkKey,
  resolveStorePath,
} from "mangabaclaw/plugin-sdk/session-store-runtime";
export { recordInboundSession } from "mangabaclaw/plugin-sdk/conversation-runtime";
export { resolveInboundLastRouteSessionKey } from "mangabaclaw/plugin-sdk/routing";
export { resolvePinnedMainDmOwnerFromAllowlist } from "mangabaclaw/plugin-sdk/security-runtime";
