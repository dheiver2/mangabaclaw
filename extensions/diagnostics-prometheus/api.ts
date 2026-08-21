// Diagnostics Prometheus API module exposes the plugin public contract.
export type {
  DiagnosticEventMetadata,
  DiagnosticEventPayload,
} from "mangabaclaw/plugin-sdk/diagnostic-runtime";
export { isInternalDiagnosticEventMetadata } from "mangabaclaw/plugin-sdk/diagnostic-runtime";
export {
  emptyPluginConfigSchema,
  type MangabaClawPluginApi,
  type MangabaClawPluginHttpRouteHandler,
  type MangabaClawPluginService,
  type MangabaClawPluginServiceContext,
} from "mangabaclaw/plugin-sdk/plugin-entry";
export { redactSensitiveText } from "mangabaclaw/plugin-sdk/security-runtime";
