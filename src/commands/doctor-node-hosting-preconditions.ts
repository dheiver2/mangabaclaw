// Doctor node-hosting preconditions expose config combinations that leave browser auth healthy
// while machine authentication or onboarding remains unavailable.
import { normalizeOptionalString } from "@mangabaclaw/normalization-core/string-coerce";
import { MANGABACLAW_AGENT_RUNTIME_ID } from "../agents/agent-runtime-id.js";
import { listAgentIds } from "../agents/agent-scope-config.js";
import { resolveDefaultModelForAgent } from "../agents/model-selection.js";
import { resolveEffectiveAgentRuntime } from "../agents/thinking-runtime.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import type { HealthFinding } from "../flows/health-checks.js";
import { hasConfiguredGatewayAuthSecretInput } from "../gateway/auth-config-utils.js";
import { normalizePluginsConfig, resolveEffectiveEnableState } from "../plugins/config-state.js";

const CHECK_ID = "core/doctor/node-hosting-preconditions";
const LOOPBACK_JOIN_CODE_MESSAGE =
  "Gateway is only bound to loopback. Set gateway.bind=lan, enable tailscale serve, or configure plugins.entries.device-pair.config.publicUrl.";

function usesIdentityHeadersWithoutMachineCredentials(cfg: MangabaClawConfig): boolean {
  const hasToken = hasConfiguredGatewayAuthSecretInput(cfg, "gateway.auth.token");
  const hasPassword = hasConfiguredGatewayAuthSecretInput(cfg, "gateway.auth.password");
  if (hasToken || hasPassword) {
    return false;
  }
  if (cfg.gateway?.auth?.mode === "trusted-proxy") {
    return true;
  }
  return (
    cfg.gateway?.tailscale?.mode === "serve" &&
    cfg.gateway?.auth?.mode !== "password" &&
    cfg.gateway?.auth?.mode !== "none" &&
    cfg.gateway?.auth?.allowTailscale !== false
  );
}

function lacksNodeOnboardingUrl(cfg: MangabaClawConfig): boolean {
  const bind = cfg.gateway?.bind ?? "loopback";
  if (bind !== "loopback" && bind !== "auto") {
    return false;
  }
  const publicUrl = cfg.plugins?.entries?.["device-pair"]?.config?.["publicUrl"];
  const remoteUrl = cfg.gateway?.remote?.url;
  const tailscaleMode = cfg.gateway?.tailscale?.mode ?? "off";
  return (
    !normalizeOptionalString(publicUrl) &&
    !normalizeOptionalString(remoteUrl) &&
    tailscaleMode !== "serve" &&
    tailscaleMode !== "funnel"
  );
}

function lacksNodeOnboardingPlugin(cfg: MangabaClawConfig): boolean {
  return !resolveEffectiveEnableState({
    id: "device-pair",
    origin: "bundled",
    config: normalizePluginsConfig(cfg.plugins),
    rootConfig: cfg,
    enabledByDefault: true,
  }).enabled;
}

function lacksEmbeddedRuntimeRoute(cfg: MangabaClawConfig): boolean {
  return listAgentIds(cfg).every((agentId) => {
    const model = resolveDefaultModelForAgent({ cfg, agentId });
    return (
      resolveEffectiveAgentRuntime({
        cfg,
        provider: model.provider,
        modelId: model.model,
        agentId,
      }) !== MANGABACLAW_AGENT_RUNTIME_ID
    );
  });
}

/** Collects config-only warnings for node authentication, onboarding, and worker ingress. */
export function collectNodeHostingPreconditionFindings(
  cfg: MangabaClawConfig,
): readonly HealthFinding[] {
  const findings: HealthFinding[] = [];
  if (lacksNodeOnboardingPlugin(cfg)) {
    findings.push({
      checkId: CHECK_ID,
      severity: "warning",
      message:
        "The device-pair plugin is not enabled; node onboarding join codes and mangabaclaw connect are unavailable.",
      path: "plugins.entries.device-pair.enabled",
      requirement: "node-onboarding-plugin",
      fixHint:
        "Set plugins.entries.device-pair.enabled: true, ensure device-pair is not denied or excluded by plugins.allow, then restart the Gateway.",
    });
  }
  if (lacksEmbeddedRuntimeRoute(cfg)) {
    findings.push({
      checkId: CHECK_ID,
      severity: "warning",
      message:
        "No configured agent/model route resolves to the embedded runtime; paired-device dispatch will fail at launch because device runners cannot run Codex, ACPX, or another external harness.",
      path: "agents",
      requirement: "device-session-runtime",
      fixHint:
        'Set agentRuntime.id: "mangabaclaw" on at least one provider/model route (models.providers.<provider>.agentRuntime, agents.defaults.models["provider/model"].agentRuntime, or agents.entries.<id>.models["provider/model"].agentRuntime), then select that agent/model for paired-device sessions. Runtime policy is model/provider-scoped; whole-agent runtime keys are ignored. For a multi-agent roster, set agents.ownership: "explicit".',
    });
  }
  if (usesIdentityHeadersWithoutMachineCredentials(cfg)) {
    findings.push({
      checkId: CHECK_ID,
      severity: "warning",
      message:
        "Gateway identity-header auth has no configured token/password path for machine clients; new node hosts cannot authenticate or become worker hosts.",
      path: "gateway.auth",
      requirement: "machine-client-auth",
      fixHint:
        "Switch gateway.auth.mode to token and configure gateway.auth.token as a SecretRef so machine clients can authenticate as devices. Keep trusted-proxy only if machine clients use a clean loopback/direct gateway.auth.password path. For Access-fronted gateways, configure the node gateway.cloudflareAccess.clientId / clientSecret SecretInputs or set CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET before mangabaclaw connect.",
    });
  }
  if (lacksNodeOnboardingUrl(cfg)) {
    findings.push({
      checkId: CHECK_ID,
      severity: "warning",
      message: LOOPBACK_JOIN_CODE_MESSAGE,
      path: "gateway.bind",
      requirement: "node-onboarding-url",
      fixHint:
        "If an edge proxy fronts node onboarding, allow /j/* and /__mangabaclaw__/worker without edge identity auth, and preserve WebSocket upgrade on /__mangabaclaw__/worker. Both routes enforce their own credentials.",
    });
  }
  return findings;
}
