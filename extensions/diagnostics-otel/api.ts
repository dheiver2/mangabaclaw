// Diagnostics Otel API module exposes the plugin public contract.
export {
  createChildDiagnosticTraceContext,
  createDiagnosticTraceContext,
  emitDiagnosticEvent,
  formatDiagnosticTraceparent,
  isValidDiagnosticSpanId,
  isValidDiagnosticTraceFlags,
  isValidDiagnosticTraceId,
  onDiagnosticEvent,
  parseDiagnosticTraceparent,
  type DiagnosticEventMetadata,
  type DiagnosticEventPayload,
  type DiagnosticEventPrivateData,
  type DiagnosticTraceContext,
} from "mangabaclaw/plugin-sdk/diagnostic-runtime";
export { emptyPluginConfigSchema, type MangabaClawPluginApi } from "mangabaclaw/plugin-sdk/plugin-entry";
export type {
  MangabaClawPluginService,
  MangabaClawPluginServiceContext,
} from "mangabaclaw/plugin-sdk/plugin-entry";
export { redactSensitiveText } from "mangabaclaw/plugin-sdk/security-runtime";
