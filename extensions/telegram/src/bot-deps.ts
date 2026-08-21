// Telegram plugin module implements bot deps behavior.
import {
  resolveApprovalOverGateway,
  type ApprovalResolveResult,
} from "mangabaclaw/plugin-sdk/approval-gateway-runtime";
import type { ChannelApprovalKind } from "mangabaclaw/plugin-sdk/approval-handler-runtime";
import type { ExecApprovalReplyDecision } from "mangabaclaw/plugin-sdk/approval-reply-runtime";
import { recordChannelActivity } from "mangabaclaw/plugin-sdk/channel-activity-runtime";
import { buildChannelInboundEventContext } from "mangabaclaw/plugin-sdk/channel-inbound";
import {
  createChannelMessageReplyPipeline,
  deliverInboundReplyWithMessageSendContext,
} from "mangabaclaw/plugin-sdk/channel-outbound";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import {
  readChannelAllowFromStore,
  recordInboundSession,
  upsertChannelPairingRequest,
} from "mangabaclaw/plugin-sdk/conversation-runtime";
import { buildModelsProviderData } from "mangabaclaw/plugin-sdk/models-provider-runtime";
import { dispatchReplyWithBufferedBlockDispatcher } from "mangabaclaw/plugin-sdk/reply-dispatch-runtime";
import { resolveInboundLastRouteSessionKey } from "mangabaclaw/plugin-sdk/routing";
import { getRuntimeConfig } from "mangabaclaw/plugin-sdk/runtime-config-snapshot";
import { resolvePinnedMainDmOwnerFromAllowlist } from "mangabaclaw/plugin-sdk/security-runtime";
import {
  getSessionEntry,
  readSessionUpdatedAt,
  readAmbientTranscriptWatermark,
  resolveAmbientTranscriptWatermarkKey,
  resolveStorePath,
} from "mangabaclaw/plugin-sdk/session-store-runtime";
import { listSkillCommandsForAgents } from "mangabaclaw/plugin-sdk/skill-commands-runtime";
import { enqueueSystemEvent } from "mangabaclaw/plugin-sdk/system-event-runtime";
import { loadWebMedia } from "mangabaclaw/plugin-sdk/web-media";
import { syncTelegramMenuCommands } from "./bot-native-command-menu.js";
import { deliverReplies, emitTelegramMessageSentHooks } from "./bot/delivery.js";
import { createTelegramDraftStream } from "./draft-stream.js";
import { recordOutboundMessageForPromptContext } from "./outbound-message-context.js";
import { editMessageTelegram } from "./send.js";
import { wasSentByBot } from "./sent-message-cache.js";

type ResolveTelegramApprovalParams = {
  cfg: MangabaClawConfig;
  approvalId: string;
  decision: ExecApprovalReplyDecision;
  channel: "telegram";
  senderId?: string | null;
  gatewayUrl?: string;
} & (
  | { approvalKind: ChannelApprovalKind; resolveMethod?: never }
  | { approvalKind?: never; resolveMethod: ChannelApprovalKind }
);

type ResolveTelegramApproval = (
  params: ResolveTelegramApprovalParams,
) => Promise<ApprovalResolveResult | void>;

export type TelegramBotDeps = {
  getRuntimeConfig: typeof getRuntimeConfig;
  resolveStorePath: typeof resolveStorePath;
  getSessionEntry?: typeof getSessionEntry;
  readSessionUpdatedAt?: typeof readSessionUpdatedAt;
  readAmbientTranscriptWatermark?: typeof readAmbientTranscriptWatermark;
  resolveAmbientTranscriptWatermarkKey?: typeof resolveAmbientTranscriptWatermarkKey;
  recordInboundSession?: typeof recordInboundSession;
  recordChannelActivity?: typeof recordChannelActivity;
  resolveInboundLastRouteSessionKey?: typeof resolveInboundLastRouteSessionKey;
  resolvePinnedMainDmOwnerFromAllowlist?: typeof resolvePinnedMainDmOwnerFromAllowlist;
  buildChannelInboundEventContext?: typeof buildChannelInboundEventContext;
  readChannelAllowFromStore: typeof readChannelAllowFromStore;
  upsertChannelPairingRequest: typeof upsertChannelPairingRequest;
  enqueueSystemEvent: typeof enqueueSystemEvent;
  dispatchReplyWithBufferedBlockDispatcher: typeof dispatchReplyWithBufferedBlockDispatcher;
  loadWebMedia?: typeof loadWebMedia;
  buildModelsProviderData: typeof buildModelsProviderData;
  listSkillCommandsForAgents: typeof listSkillCommandsForAgents;
  syncTelegramMenuCommands?: typeof syncTelegramMenuCommands;
  wasSentByBot: typeof wasSentByBot;
  resolveApproval?: ResolveTelegramApproval;
  createTelegramDraftStream?: typeof createTelegramDraftStream;
  deliverReplies?: typeof deliverReplies;
  deliverInboundReplyWithMessageSendContext?: typeof deliverInboundReplyWithMessageSendContext;
  emitTelegramMessageSentHooks?: typeof emitTelegramMessageSentHooks;
  editMessageTelegram?: typeof editMessageTelegram;
  recordOutboundMessageForPromptContext?: typeof recordOutboundMessageForPromptContext;
  createChannelMessageReplyPipeline?: typeof createChannelMessageReplyPipeline;
};

export const defaultTelegramBotDeps: TelegramBotDeps = {
  get getRuntimeConfig() {
    return getRuntimeConfig;
  },
  get resolveStorePath() {
    return resolveStorePath;
  },
  get getSessionEntry() {
    return getSessionEntry;
  },
  get readChannelAllowFromStore() {
    return readChannelAllowFromStore;
  },
  get readSessionUpdatedAt() {
    return readSessionUpdatedAt;
  },
  get readAmbientTranscriptWatermark() {
    return readAmbientTranscriptWatermark;
  },
  get resolveAmbientTranscriptWatermarkKey() {
    return resolveAmbientTranscriptWatermarkKey;
  },
  get recordInboundSession() {
    return recordInboundSession;
  },
  get recordChannelActivity() {
    return recordChannelActivity;
  },
  get resolveInboundLastRouteSessionKey() {
    return resolveInboundLastRouteSessionKey;
  },
  get resolvePinnedMainDmOwnerFromAllowlist() {
    return resolvePinnedMainDmOwnerFromAllowlist;
  },
  get buildChannelInboundEventContext() {
    return buildChannelInboundEventContext;
  },
  get upsertChannelPairingRequest() {
    return upsertChannelPairingRequest;
  },
  get enqueueSystemEvent() {
    return enqueueSystemEvent;
  },
  get dispatchReplyWithBufferedBlockDispatcher() {
    return dispatchReplyWithBufferedBlockDispatcher;
  },
  get loadWebMedia() {
    return loadWebMedia;
  },
  get buildModelsProviderData() {
    return buildModelsProviderData;
  },
  get listSkillCommandsForAgents() {
    return listSkillCommandsForAgents;
  },
  get syncTelegramMenuCommands() {
    return syncTelegramMenuCommands;
  },
  get wasSentByBot() {
    return wasSentByBot;
  },
  get resolveApproval() {
    return resolveApprovalOverGateway as ResolveTelegramApproval;
  },
  get createTelegramDraftStream() {
    return createTelegramDraftStream;
  },
  get deliverReplies() {
    return deliverReplies;
  },
  get deliverInboundReplyWithMessageSendContext() {
    return deliverInboundReplyWithMessageSendContext;
  },
  get emitTelegramMessageSentHooks() {
    return emitTelegramMessageSentHooks;
  },
  get editMessageTelegram() {
    return editMessageTelegram;
  },
  get recordOutboundMessageForPromptContext() {
    return recordOutboundMessageForPromptContext;
  },
  get createChannelMessageReplyPipeline() {
    return createChannelMessageReplyPipeline;
  },
};
