import type { Bot, Context } from "grammy";
import type {
  ChannelGroupPolicy,
  MangabaClawConfig,
  TelegramAccountConfig,
  TelegramDirectConfig,
  TelegramGroupConfig,
  TelegramTopicConfig,
} from "mangabaclaw/plugin-sdk/config-contracts";
import type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime-env";
import type { TelegramBotDeps } from "./bot-deps.js";
import type {
  TelegramMediaRef,
  TelegramMessageContextOptions,
  TelegramPromptContextEntry,
} from "./bot-message-context.types.js";
import type {
  TelegramMessageProcessingResult,
  TelegramSpooledReplayDeferredParticipant,
} from "./bot-processing-outcome.js";
import type { TelegramUpdateKeyContext } from "./bot-updates.js";
import type { TelegramBotOptions } from "./bot.types.js";
import type { TelegramContext } from "./bot/types.js";
import type { TelegramTransport } from "./fetch.js";
import type { TelegramReplyChainEntry } from "./message-cache.js";

export type TelegramMessageProcessorTurnContext = {
  cfg: MangabaClawConfig;
  telegramCfg: TelegramAccountConfig;
  onDispatchStart?: () => Promise<void> | void;
  spooledReplayAbortSignal?: AbortSignal;
  spooledReplayParticipant?: TelegramSpooledReplayDeferredParticipant;
  finalizeSpooledReplayResult?: (
    result: TelegramMessageProcessingResult,
    phase: "adopted" | "terminal",
  ) => Promise<TelegramMessageProcessingResult>;
  completeSpooledReplayAfterIrrevocableAdoption?: (
    error: unknown,
  ) => Promise<TelegramMessageProcessingResult> | TelegramMessageProcessingResult;
};

type ProcessTelegramMessageOptions = {
  ctx: TelegramContext;
  allMedia: TelegramMediaRef[];
  storeAllowFrom: string[];
  turnContext: TelegramMessageProcessorTurnContext;
  options?: TelegramMessageContextOptions;
  replyMedia?: TelegramMediaRef[];
  replyChain?: TelegramReplyChainEntry[];
  promptContext?: TelegramPromptContextEntry[];
};

type ProcessTelegramMessage = (
  options: ProcessTelegramMessageOptions,
) => Promise<TelegramMessageProcessingResult>;

export type TelegramResolvedGroupConfig = {
  groupConfig?: TelegramGroupConfig | TelegramDirectConfig;
  topicConfig?: TelegramTopicConfig;
};

export type TelegramNativeCommandCallbackDispatcher = (params: {
  botUser: Context["me"];
  callbackQuery: NonNullable<Context["callbackQuery"]>;
  commandText: string;
}) => Promise<{ handled: boolean; clearButtons: boolean }>;

type TelegramHandlerLogger = {
  info: (fields: Record<string, unknown>, message: string) => void;
  warn: (fields: Record<string, unknown>, message: string) => void;
};

export type RegisterTelegramHandlerParams = {
  cfg: MangabaClawConfig;
  accountId: string;
  ownerAgentId: string;
  bot: Bot;
  mediaMaxBytes: number;
  opts: TelegramBotOptions;
  telegramTransport?: TelegramTransport;
  runtime: RuntimeEnv;
  telegramCfg: TelegramAccountConfig;
  telegramDeps: TelegramBotDeps;
  resolveGroupPolicy: (chatId: string | number, cfg: MangabaClawConfig) => ChannelGroupPolicy;
  resolveGroupActivation: (params: {
    agentId?: string;
    sessionKey: string;
    cfg: MangabaClawConfig;
  }) => boolean | undefined;
  resolveGroupRequireMention: (chatId: string | number, cfg: MangabaClawConfig) => boolean;
  resolveTelegramGroupConfig: (
    chatId: string | number,
    messageThreadId: number | undefined,
    cfg: MangabaClawConfig,
  ) => TelegramResolvedGroupConfig;
  shouldSkipUpdate: (ctx: TelegramUpdateKeyContext) => boolean;
  processMessage: ProcessTelegramMessage;
  logger: TelegramHandlerLogger;
  nativeCommandCallbackDispatcher?: TelegramNativeCommandCallbackDispatcher;
};

export type TelegramInboundDisposition =
  | { kind: "ignored" }
  | { kind: "recorded" }
  | { kind: "buffered"; buffer: "text-fragment" | "media-group" | "debounce" }
  | { kind: "processed" };

export interface TelegramInboundPipeline {
  handle: (ctx: Context) => Promise<TelegramInboundDisposition>;
}

type TelegramCallbackRouteOutcome = { kind: "ignored" } | { kind: "handled" };

export interface TelegramCallbackRouter {
  route(ctx: Context): Promise<TelegramCallbackRouteOutcome>;
}

export interface TelegramEventBindings {
  registerReaction(): void;
  registerPolls(): void;
  registerMigration(): void;
  registerMessages(): void;
}
