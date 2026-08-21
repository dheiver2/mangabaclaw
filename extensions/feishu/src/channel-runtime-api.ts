// Feishu API module exposes the plugin public contract.
export type {
  ChannelMessageActionName,
  ChannelMeta,
  ChannelPlugin,
  ClawdbotConfig,
} from "../runtime-api.js";

export { DEFAULT_ACCOUNT_ID } from "mangabaclaw/plugin-sdk/account-resolution";
export { createActionGate } from "mangabaclaw/plugin-sdk/channel-actions";
export {
  buildProbeChannelStatusSummary,
  createDefaultChannelRuntimeState,
} from "mangabaclaw/plugin-sdk/status-helpers";
export { PAIRING_APPROVED_MESSAGE } from "mangabaclaw/plugin-sdk/channel-status";
