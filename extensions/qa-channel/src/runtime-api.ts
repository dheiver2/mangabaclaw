// Qa Channel API module exposes the plugin public contract.
export type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelGatewayContext,
} from "mangabaclaw/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "mangabaclaw/plugin-sdk/channel-core";
export type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime";
export type { PluginRuntime } from "mangabaclaw/plugin-sdk/runtime-store";
export {
  buildChannelConfigSchema,
  buildChannelOutboundSessionRoute,
  createChatChannelPlugin,
  defineChannelPluginEntry,
} from "mangabaclaw/plugin-sdk/channel-core";
export { jsonResult, readStringParam } from "mangabaclaw/plugin-sdk/channel-actions";
export { getChatChannelMeta } from "mangabaclaw/plugin-sdk/channel-plugin-common";
export {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "mangabaclaw/plugin-sdk/status-helpers";
export { createPluginRuntimeStore } from "mangabaclaw/plugin-sdk/runtime-store";
export { createChannelMessageReplyPipeline } from "mangabaclaw/plugin-sdk/channel-outbound";
