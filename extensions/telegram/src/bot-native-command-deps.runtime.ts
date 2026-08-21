import { dispatchChannelInboundTurn } from "mangabaclaw/plugin-sdk/channel-inbound";
import { readChannelAllowFromStore } from "mangabaclaw/plugin-sdk/conversation-runtime";
// Telegram plugin module implements bot native command deps behavior.
import type {
  ModelsAuthLoginFlowOptions,
  ModelsAuthLoginFlowResult,
} from "mangabaclaw/plugin-sdk/provider-auth-login-flow-runtime";
import { getRuntimeConfig } from "mangabaclaw/plugin-sdk/runtime-config-snapshot";
import { listSkillCommandsForAgents } from "mangabaclaw/plugin-sdk/skill-commands-runtime";
import type { TelegramBotDeps } from "./bot-deps.js";
import { syncTelegramMenuCommands } from "./bot-native-command-menu.js";
import { loadTelegramSendModule } from "./send-runtime.js";

export type TelegramNativeCommandDeps = Pick<
  TelegramBotDeps,
  | "editMessageTelegram"
  | "getRuntimeConfig"
  | "listSkillCommandsForAgents"
  | "readChannelAllowFromStore"
  | "syncTelegramMenuCommands"
> & {
  dispatchChannelInboundTurn?: typeof dispatchChannelInboundTurn;
  runModelsAuthLoginFlow?: (opts: ModelsAuthLoginFlowOptions) => Promise<ModelsAuthLoginFlowResult>;
  sendMessageTelegram: typeof import("./send.js").sendMessageTelegram;
};

export const defaultTelegramNativeCommandDeps: TelegramNativeCommandDeps & {
  dispatchChannelInboundTurn: typeof dispatchChannelInboundTurn;
} = {
  get getRuntimeConfig() {
    return getRuntimeConfig;
  },
  get readChannelAllowFromStore() {
    return readChannelAllowFromStore;
  },
  get dispatchChannelInboundTurn() {
    return dispatchChannelInboundTurn;
  },
  get listSkillCommandsForAgents() {
    return listSkillCommandsForAgents;
  },
  get syncTelegramMenuCommands() {
    return syncTelegramMenuCommands;
  },
  async runModelsAuthLoginFlow(opts) {
    const { runModelsAuthLoginFlow } =
      await import("mangabaclaw/plugin-sdk/provider-auth-login-flow-runtime");
    return await runModelsAuthLoginFlow(opts);
  },
  async editMessageTelegram(...args) {
    const { editMessageTelegram } = await loadTelegramSendModule();
    return await editMessageTelegram(...args);
  },
  async sendMessageTelegram(...args) {
    const { sendMessageTelegram } = await loadTelegramSendModule();
    return await sendMessageTelegram(...args);
  },
};
