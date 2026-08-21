// Discord plugin module implements ack reactions behavior.
import {
  createStatusReactionController,
  logAckFailure,
  type StatusReactionAdapter,
} from "mangabaclaw/plugin-sdk/channel-feedback";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { logVerbose } from "mangabaclaw/plugin-sdk/runtime-env";
import { createDiscordRuntimeAccountContext } from "../client.js";
import type { RequestClient } from "../internal/discord.js";
import { reactMessageDiscord, removeReactionDiscord } from "../send.js";
import type { DiscordReactionRuntimeContext } from "../send.types.js";

export function createDiscordAckReactionContext(params: {
  rest: RequestClient;
  cfg: MangabaClawConfig;
  accountId: string;
}): DiscordReactionRuntimeContext {
  return {
    rest: params.rest,
    ...createDiscordRuntimeAccountContext({
      cfg: params.cfg,
      accountId: params.accountId,
    }),
  };
}

export function createDiscordAckReactionAdapter(params: {
  channelId: string;
  messageId: string;
  reactionContext: DiscordReactionRuntimeContext;
}): StatusReactionAdapter {
  return {
    setReaction: async (emoji) => {
      await reactMessageDiscord(params.channelId, params.messageId, emoji, params.reactionContext);
    },
    removeReaction: async (emoji) => {
      await removeReactionDiscord(
        params.channelId,
        params.messageId,
        emoji,
        params.reactionContext,
      );
    },
  };
}

export function queueInitialDiscordAckReaction(params: {
  enabled: boolean;
  shouldSendAckReaction: boolean;
  ackReaction: string | undefined;
  statusReactions: ReturnType<typeof createStatusReactionController>;
  reactionAdapter: StatusReactionAdapter;
  target: string;
}) {
  if (params.enabled) {
    void params.statusReactions.setQueued();
    return;
  }
  if (!params.shouldSendAckReaction || !params.ackReaction) {
    return;
  }
  void params.reactionAdapter.setReaction(params.ackReaction).catch((err: unknown) => {
    logAckFailure({
      log: logVerbose,
      channel: "discord",
      target: params.target,
      error: err,
    });
  });
}
