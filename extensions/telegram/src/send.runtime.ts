// Telegram plugin module implements send behavior.
export { requireRuntimeConfig } from "mangabaclaw/plugin-sdk/plugin-config-runtime";
export { resolveMarkdownTableMode } from "mangabaclaw/plugin-sdk/markdown-table-runtime";
export type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export type { PollInput } from "mangabaclaw/plugin-sdk/media-runtime";
export {
  buildOutboundMediaLoadOptions,
  getImageMetadata,
  normalizePollInput,
  probeVideoDimensions,
} from "mangabaclaw/plugin-sdk/media-runtime";
export { loadWebMedia } from "mangabaclaw/plugin-sdk/web-media";
