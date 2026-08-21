/**
 * @deprecated Use `mangabaclaw/plugin-sdk/channel-outbound` for outbound/message
 * lifecycle helpers and `mangabaclaw/plugin-sdk/channel-inbound` for inbound
 * reply dispatch helpers.
 */
export * from "./channel-outbound.js";
/** @deprecated Use `hasFinalInboundReplyDispatch(...)` from `mangabaclaw/plugin-sdk/channel-inbound`. */
export { hasFinalChannelTurnDispatch } from "../channels/turn/dispatch-result.js";
/** @deprecated Use `hasVisibleInboundReplyDispatch(...)` from `mangabaclaw/plugin-sdk/channel-inbound`. */
export { hasVisibleChannelTurnDispatch } from "../channels/turn/dispatch-result.js";
/** @deprecated Use `resolveInboundReplyDispatchCounts(...)` from `mangabaclaw/plugin-sdk/channel-inbound`. */
export { resolveChannelTurnDispatchCounts } from "../channels/turn/dispatch-result.js";
