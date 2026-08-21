// Private runtime barrel for the bundled Twitch extension.
// Keep this barrel thin and aligned with the local extension surface.

export type {
  ChannelAccountSnapshot,
  ChannelCapabilities,
  ChannelGatewayContext,
  ChannelLogSink,
  ChannelMessageActionAdapter,
  ChannelMessageActionContext,
  ChannelMeta,
  ChannelOutboundAdapter,
  ChannelOutboundContext,
  ChannelResolveKind,
  ChannelResolveResult,
  ChannelStatusAdapter,
} from "mangabaclaw/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "mangabaclaw/plugin-sdk/channel-core";
export type { OutboundDeliveryResult } from "mangabaclaw/plugin-sdk/channel-send-result";
export type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime";
export type { WizardPrompter } from "mangabaclaw/plugin-sdk/setup";
