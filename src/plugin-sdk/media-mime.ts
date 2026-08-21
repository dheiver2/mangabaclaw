// Narrow media MIME helper surface for plugins that do not need the full media runtime.

export {
  detectMime,
  extensionForMime,
  getFileExtension,
  mimeTypeFromFilePath,
  normalizeMimeType,
} from "@mangabaclaw/media-core/mime";
export { mediaKindFromMime, type MediaKind } from "@mangabaclaw/media-core/constants";
