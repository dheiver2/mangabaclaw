// Signal transport binding for numbered ask_user reactions.
import type { OutboundDeliveryResult } from "mangabaclaw/plugin-sdk/channel-send-result";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import {
  createQuestionReactionTargetStore,
  questionGatewayRuntime,
} from "mangabaclaw/plugin-sdk/question-gateway-runtime";
import type { ReplyPayload } from "mangabaclaw/plugin-sdk/reply-runtime";
import { normalizeAccountId } from "mangabaclaw/plugin-sdk/routing";
import { resolveSignalTarget } from "./aliases.js";
import {
  resolveSignalApprovalConversationKey,
  resolveSignalApprovalTargetAuthorKeys,
} from "./approval-reactions.js";

type SignalQuestionReactionIdentity = {
  accountId: string;
  conversationKey: string;
  messageId: string;
};

function buildKey(identity: SignalQuestionReactionIdentity): string | null {
  const values = [identity.accountId, identity.conversationKey, identity.messageId].map((value) =>
    value.trim(),
  );
  return values.every(Boolean) ? values.join(":") : null;
}

const questionReactionTargets = createQuestionReactionTargetStore<
  SignalQuestionReactionIdentity,
  string[]
>({
  channel: "signal",
  channelDisplayName: "Signal",
  buildKey,
  identityMatches: (stored, incoming) =>
    Boolean(stored && incoming?.some((authorKey) => stored.includes(authorKey))),
  registerChannelDelivery: questionGatewayRuntime.registerChannelDelivery,
  resolveReaction: questionGatewayRuntime.resolveReaction,
});

function resolveConversationKey(params: {
  cfg: MangabaClawConfig;
  accountId?: string | null;
  to: string;
}): string | null {
  try {
    return (
      resolveSignalTarget({
        cfg: params.cfg,
        accountId: params.accountId,
        input: params.to,
      })?.to ?? resolveSignalApprovalConversationKey(params.to)
    );
  } catch {
    return resolveSignalApprovalConversationKey(params.to);
  }
}

export function registerSignalQuestionReactionTargetForDeliveredPayload(params: {
  cfg: MangabaClawConfig;
  target: { channel: string; to: string; accountId?: string | null };
  payload: ReplyPayload;
  results: readonly OutboundDeliveryResult[];
  targetAuthor?: string | null;
  targetAuthorUuid?: string | null;
}): boolean {
  const binding = questionGatewayRuntime.readReactionBinding(params.payload);
  if (params.target.channel !== "signal" || !binding) {
    return false;
  }
  const conversationKey = resolveConversationKey({ cfg: params.cfg, ...params.target });
  const targetAuthorKeys = resolveSignalApprovalTargetAuthorKeys(params);
  if (!conversationKey || targetAuthorKeys.length === 0) {
    return false;
  }
  const accountId = normalizeAccountId(params.target.accountId ?? undefined);
  let registered = false;
  for (const result of params.results) {
    const messageId = result.channel === "signal" ? result.messageId.trim() : "";
    if (!messageId || messageId === "unknown") {
      continue;
    }
    registered =
      questionReactionTargets.register(
        binding,
        { accountId, conversationKey, messageId },
        targetAuthorKeys,
      ) || registered;
  }
  return registered;
}

export async function maybeResolveSignalQuestionReaction(params: {
  cfg: MangabaClawConfig;
  accountId: string;
  conversationKey: string;
  messageId: string;
  reactionKey: string;
  isRemove: boolean;
  actorId: string;
  targetAuthor?: string | null;
  targetAuthorUuid?: string | null;
  gatewayUrl?: string;
  logDebug?: (message: string) => void;
}): Promise<boolean> {
  if (params.isRemove) {
    return false;
  }
  const optionIndex = questionGatewayRuntime.resolveReactionIndex(params.reactionKey);
  if (optionIndex === undefined) {
    return false;
  }
  const authorKeys = resolveSignalApprovalTargetAuthorKeys(params);
  return await questionReactionTargets.resolve({
    identities: [
      {
        accountId: params.accountId,
        conversationKey: params.conversationKey,
        messageId: params.messageId,
      },
    ],
    optionIndex,
    cfg: params.cfg,
    senderId: params.actorId,
    gatewayUrl: params.gatewayUrl,
    metadata: authorKeys,
    logDebug: params.logDebug,
  });
}
