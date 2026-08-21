// Slack plugin module implements slash dispatch behavior.
import {
  dispatchChannelInboundTurn as dispatchChannelInboundTurnImpl,
  isChannelPartialDeliveryError as isChannelPartialDeliveryErrorImpl,
} from "mangabaclaw/plugin-sdk/channel-inbound";
import { resolveConversationLabel as resolveConversationLabelImpl } from "mangabaclaw/plugin-sdk/conversation-runtime";
import { resolveMarkdownTableMode as resolveMarkdownTableModeImpl } from "mangabaclaw/plugin-sdk/markdown-table-runtime";
import {
  finalizeInboundContext as finalizeInboundContextImpl,
  resolveChunkMode as resolveChunkModeImpl,
} from "mangabaclaw/plugin-sdk/reply-runtime";
import { resolveAgentRoute as resolveAgentRouteImpl } from "mangabaclaw/plugin-sdk/routing";
import { deliverSlackSlashReplies as deliverSlackSlashRepliesImpl } from "./replies.js";

type ResolveChunkMode = typeof import("mangabaclaw/plugin-sdk/reply-runtime").resolveChunkMode;
type FinalizeInboundContext =
  typeof import("mangabaclaw/plugin-sdk/reply-runtime").finalizeInboundContext;
type DispatchChannelInboundTurn =
  typeof import("mangabaclaw/plugin-sdk/channel-inbound").dispatchChannelInboundTurn;
type IsChannelPartialDeliveryError =
  typeof import("mangabaclaw/plugin-sdk/channel-inbound").isChannelPartialDeliveryError;
type ResolveConversationLabel =
  typeof import("mangabaclaw/plugin-sdk/conversation-runtime").resolveConversationLabel;
type ResolveMarkdownTableMode =
  typeof import("mangabaclaw/plugin-sdk/markdown-table-runtime").resolveMarkdownTableMode;
type ResolveAgentRoute = typeof import("mangabaclaw/plugin-sdk/routing").resolveAgentRoute;
type DeliverSlackSlashReplies = typeof import("./replies.js").deliverSlackSlashReplies;

export function resolveChunkMode(
  ...args: Parameters<ResolveChunkMode>
): ReturnType<ResolveChunkMode> {
  return resolveChunkModeImpl(...args);
}

export function finalizeInboundContext(
  ...args: Parameters<FinalizeInboundContext>
): ReturnType<FinalizeInboundContext> {
  return finalizeInboundContextImpl(...args);
}

export function dispatchChannelInboundTurn(
  ...args: Parameters<DispatchChannelInboundTurn>
): ReturnType<DispatchChannelInboundTurn> {
  return dispatchChannelInboundTurnImpl(...args);
}

export function isChannelPartialDeliveryError(
  ...args: Parameters<IsChannelPartialDeliveryError>
): ReturnType<IsChannelPartialDeliveryError> {
  return isChannelPartialDeliveryErrorImpl(...args);
}

export function resolveConversationLabel(
  ...args: Parameters<ResolveConversationLabel>
): ReturnType<ResolveConversationLabel> {
  return resolveConversationLabelImpl(...args);
}

export function resolveMarkdownTableMode(
  ...args: Parameters<ResolveMarkdownTableMode>
): ReturnType<ResolveMarkdownTableMode> {
  return resolveMarkdownTableModeImpl(...args);
}

export function resolveAgentRoute(
  ...args: Parameters<ResolveAgentRoute>
): ReturnType<ResolveAgentRoute> {
  return resolveAgentRouteImpl(...args);
}

export function deliverSlackSlashReplies(
  ...args: Parameters<DeliverSlackSlashReplies>
): ReturnType<DeliverSlackSlashReplies> {
  return deliverSlackSlashRepliesImpl(...args);
}
