// Irc API module exposes the plugin public contract.
export { createAccountStatusSink } from "mangabaclaw/plugin-sdk/channel-outbound";
export { DEFAULT_ACCOUNT_ID } from "mangabaclaw/plugin-sdk/account-id";
export type { ChannelPlugin } from "mangabaclaw/plugin-sdk/channel-core";
export { PAIRING_APPROVED_MESSAGE } from "mangabaclaw/plugin-sdk/channel-status";
export { buildBaseChannelStatusSummary } from "mangabaclaw/plugin-sdk/status-helpers";
export { chunkTextForOutbound } from "mangabaclaw/plugin-sdk/text-chunking";
