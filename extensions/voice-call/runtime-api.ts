// Private runtime barrel for the bundled Voice Call extension.
// Keep this barrel thin and aligned with the local extension surface.

export { definePluginEntry } from "mangabaclaw/plugin-sdk/plugin-entry";
export type { MangabaClawPluginApi } from "mangabaclaw/plugin-sdk/plugin-entry";
export type { GatewayRequestHandlerOptions } from "mangabaclaw/plugin-sdk/gateway-runtime";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "mangabaclaw/plugin-sdk/webhook-request-guards";
export { fetchWithSsrFGuard, isBlockedHostnameOrIp } from "mangabaclaw/plugin-sdk/ssrf-runtime";
export type { SessionEntry } from "mangabaclaw/plugin-sdk/session-store-runtime";
export {
  TtsAutoSchema,
  TtsConfigSchema,
  TtsModeSchema,
  TtsProviderSchema,
} from "mangabaclaw/plugin-sdk/tts-runtime";
export { sleep } from "mangabaclaw/plugin-sdk/runtime-env";
