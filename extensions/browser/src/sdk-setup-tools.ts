/**
 * Browser-local SDK setup/tooling bridge for CLI, media, and action helpers.
 */
export {
  callGatewayTool,
  listNodes,
  resolveNodeIdFromList,
} from "mangabaclaw/plugin-sdk/agent-harness-runtime";
export type { AnyAgentTool } from "mangabaclaw/plugin-sdk/agent-harness-runtime";
export {
  imageResultFromFile,
  jsonResult,
  readPositiveIntegerParam,
  readStringParam,
} from "mangabaclaw/plugin-sdk/channel-actions";
export {
  formatCliCommand,
  formatHelpExamples,
  inheritOptionFromParent,
  note,
  theme,
} from "mangabaclaw/plugin-sdk/cli-runtime";
export { danger, info } from "mangabaclaw/plugin-sdk/runtime-env";
export {
  IMAGE_REDUCE_QUALITY_STEPS,
  buildImageResizeSideGrid,
  getImageMetadata,
  isImageProcessorUnavailableError,
  resizeToJpeg,
} from "mangabaclaw/plugin-sdk/media-runtime";
export { detectMime } from "mangabaclaw/plugin-sdk/media-mime";
export { ensureMediaDir, saveMediaBuffer } from "mangabaclaw/plugin-sdk/media-runtime";
export { describeImageFile } from "mangabaclaw/plugin-sdk/media-understanding-runtime";
export { formatDocsLink } from "mangabaclaw/plugin-sdk/setup-tools";
