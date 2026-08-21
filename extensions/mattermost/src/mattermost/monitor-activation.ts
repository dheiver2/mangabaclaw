// Mattermost maps transport mention facts into the shared channel evaluator.
import {
  resolveInboundMentionDecision,
  type InboundImplicitMentionKind,
} from "mangabaclaw/plugin-sdk/channel-inbound";
import { resolveChannelImplicitMentions } from "mangabaclaw/plugin-sdk/channel-ingress-runtime";
import type { ChatType, MangabaClawConfig } from "./runtime-api.js";

export function resolveMattermostInboundMentionDecision(params: {
  cfg: MangabaClawConfig;
  accountId: string;
  kind: ChatType;
  requireMention: boolean;
  canDetectMention: boolean;
  wasMentioned: boolean;
  implicitMentionKinds?: readonly InboundImplicitMentionKind[];
  allowTextCommands: boolean;
  hasControlCommand: boolean;
  commandAuthorized: boolean;
}) {
  const implicitMentions = resolveChannelImplicitMentions({
    cfg: params.cfg,
    channel: "mattermost",
    accountId: params.accountId,
  });
  return resolveInboundMentionDecision({
    facts: {
      canDetectMention: params.canDetectMention,
      wasMentioned: params.wasMentioned,
      implicitMentionKinds: params.implicitMentionKinds,
    },
    policy: {
      isGroup: params.kind !== "direct",
      requireMention: params.requireMention,
      implicitMentions,
      allowTextCommands: params.allowTextCommands,
      hasControlCommand: params.hasControlCommand,
      commandAuthorized: params.commandAuthorized,
    },
  });
}
