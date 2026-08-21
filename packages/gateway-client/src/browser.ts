// Browser-safe gateway client surface. Keep Node transport/TLS dependencies out
// of this entry so browser consumers share the wire engine without polyfills.
export * from "./device-auth.js";
export * from "./browser-device-auth.js";
export * from "./gateway-origin-scope.js";
export * from "./connect-auth.js";
export * from "./protocol-client.js";
export * from "./reconnect-policy.js";
export * from "./session-projection.js";
export * from "./session-subscriptions.js";
export {
  DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS,
  DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS,
  resolveSafeTimeoutDelayMs,
} from "./timeouts.js";
export * from "@mangabaclaw/gateway-protocol/client-info";
export * from "@mangabaclaw/gateway-protocol/connect-error-details";
export * from "@mangabaclaw/gateway-protocol/gateway-error-details";
export * from "@mangabaclaw/gateway-protocol/startup-unavailable";
export * from "@mangabaclaw/gateway-protocol/version";
export type { ConnectParams, ErrorShape, EventFrame, HelloOk } from "@mangabaclaw/gateway-protocol";
