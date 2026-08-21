/**
 * Public SDK facade for core channel plugin construction helpers.
 */
export type {
  ChannelConfigUiHint,
  ChannelPlugin,
  MangabaClawConfig,
  MangabaClawPluginApi,
  PluginCommandContext,
  PluginRuntime,
  ChannelOutboundSessionRouteParams,
} from "./core.js";

export { createChannelPluginBase } from "./core.js";

export {
  buildChannelConfigSchema,
  buildChannelOutboundSessionRoute,
  buildThreadAwareOutboundSessionRoute,
  clearAccountEntryFields,
  createChatChannelPlugin,
  defineChannelPluginEntry,
  defineSetupPluginEntry,
  parseOptionalDelimitedEntries,
  recoverCurrentThreadSessionId,
  stripChannelTargetPrefix,
  stripTargetKindPrefix,
  tryReadSecretFileSync,
} from "./core.js";
export { createChannelConfigUiHints } from "./channel-config-ui-hints.js";
