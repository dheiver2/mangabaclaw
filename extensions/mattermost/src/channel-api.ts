// Mattermost API module exposes the plugin public contract.
export { createAccountStatusSink } from "mangabaclaw/plugin-sdk/channel-outbound";
export type { ChannelPlugin } from "mangabaclaw/plugin-sdk/core";
export { DEFAULT_ACCOUNT_ID } from "mangabaclaw/plugin-sdk/core";
export { chunkTextForOutbound } from "mangabaclaw/plugin-sdk/text-chunking";
