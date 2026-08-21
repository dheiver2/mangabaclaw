// Loaded-target resolution uses only already-loaded plugins so hot send paths
// can avoid triggering channel discovery.
import { getLoadedChannelPluginForRead } from "../../channels/plugins/registry-loaded.js";
import type { ChannelOutboundTargetMode } from "../../channels/plugins/types.public.js";
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import {
  resolveOutboundTargetWithPlugin,
  type OutboundTargetResolution,
} from "./targets-resolve-shared.js";

/** Resolves targets through an already-loaded channel plugin without bootstrap discovery. */
export function tryResolveLoadedOutboundTarget(params: {
  channel: string;
  to?: string;
  allowFrom?: string[];
  cfg?: MangabaClawConfig;
  accountId?: string | null;
  mode?: ChannelOutboundTargetMode;
}): OutboundTargetResolution | undefined {
  return resolveOutboundTargetWithPlugin({
    plugin: getLoadedChannelPluginForRead(params.channel),
    target: params,
  });
}
