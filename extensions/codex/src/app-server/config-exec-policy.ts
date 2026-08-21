import { AgentHarnessPreflightError } from "mangabaclaw/plugin-sdk/agent-harness-runtime";
import type { EmbeddedRunAttemptParamsV2 } from "mangabaclaw/plugin-sdk/agent-harness-runtime";
import { resolveAgentConfig } from "mangabaclaw/plugin-sdk/agent-scope-runtime";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import {
  resolveExecApprovalsFromFile,
  type ExecApprovalsFile,
} from "mangabaclaw/plugin-sdk/exec-approvals-runtime";
import type {
  CodexAppServerApprovalPolicy,
  CodexAppServerApprovalsReviewer,
  CodexAppServerDefaultPolicy,
  CodexAppServerPolicyMode,
  CodexAppServerSandboxMode,
  MangabaClawExecApprovalFloorsForCodexAppServer,
  MangabaClawExecAsk,
  MangabaClawExecMode,
  MangabaClawExecPolicy,
  MangabaClawExecPolicyForCodexAppServer,
  MangabaClawExecSecurity,
} from "./config-contracts.js";
import { readExecAsk, readExecSecurity, readRecord } from "./config-utils.js";

export function selectForcedPromptingSandbox(params: {
  configuredSandbox?: CodexAppServerSandboxMode;
  defaultSandbox?: CodexAppServerSandboxMode;
}): CodexAppServerSandboxMode {
  if (params.configuredSandbox === "read-only" || params.defaultSandbox === "read-only") {
    return "read-only";
  }
  return params.defaultSandbox ?? "workspace-write";
}

export function selectForcedDangerFullAccessSandbox(params: {
  configuredSandbox?: CodexAppServerSandboxMode;
  defaultPolicy: CodexAppServerDefaultPolicy | undefined;
  mangabaClawSandboxActive: boolean;
}): CodexAppServerSandboxMode {
  if (params.configuredSandbox === "read-only") {
    return "read-only";
  }
  if (params.defaultPolicy?.dangerFullAccessAllowed === false) {
    if (params.mangabaClawSandboxActive) {
      return params.defaultPolicy.sandbox ?? "workspace-write";
    }
    throw new Error(
      "legacy full exec security with ask requires Codex app-server danger-full-access",
    );
  }
  return "danger-full-access";
}

export function selectGuardianSandbox(
  allowedSandboxModes: Set<CodexAppServerSandboxMode> | undefined,
): CodexAppServerSandboxMode {
  if (allowedSandboxModes === undefined || allowedSandboxModes.has("workspace-write")) {
    return "workspace-write";
  }
  if (allowedSandboxModes.has("read-only")) {
    return "read-only";
  }
  if (allowedSandboxModes.has("danger-full-access")) {
    return "danger-full-access";
  }
  return "workspace-write";
}

export function resolveApprovalPolicy(value: unknown): CodexAppServerApprovalPolicy | undefined {
  if (value === "on-failure") {
    return "on-request";
  }
  return value === "on-request" || value === "untrusted" || value === "never" ? value : undefined;
}

export function resolveSandbox(value: unknown): CodexAppServerSandboxMode | undefined {
  return value === "read-only" || value === "workspace-write" || value === "danger-full-access"
    ? value
    : undefined;
}

export function resolveApprovalsReviewer(
  value: unknown,
): CodexAppServerApprovalsReviewer | undefined {
  return value === "auto_review" || value === "guardian_subagent" || value === "user"
    ? value
    : undefined;
}

function resolveMangabaClawExecPolicyFromConfig(params: {
  config?: MangabaClawConfig;
  agentId?: string;
}): MangabaClawExecPolicy {
  const globalExec = readRecord(params.config?.tools?.exec);
  const globalPolicy = applyMangabaClawExecPolicyLayer(createDefaultMangabaClawExecPolicy(), globalExec);
  const agentId = params.agentId?.trim();
  const agentExec = agentId
    ? readRecord(resolveAgentConfig(params.config ?? {}, agentId)?.tools?.exec)
    : undefined;
  return applyMangabaClawExecPolicyLayer(globalPolicy, agentExec);
}

export function resolveMangabaClawExecPolicyForCodexAppServer(params: {
  permissionMode?: EmbeddedRunAttemptParamsV2["permissionMode"];
  execOverrides?: {
    mode?: unknown;
    security?: unknown;
    ask?: unknown;
  };
  approvals?: ExecApprovalsFile;
  config?: MangabaClawConfig;
  agentId?: string;
}): MangabaClawExecPolicyForCodexAppServer {
  if (params.permissionMode === "full") {
    return { ...resolveMangabaClawExecPolicyForMode("full"), touched: true };
  }
  const basePolicy = resolveMangabaClawExecPolicyFromConfig({
    config: params.config,
    agentId: params.agentId,
  });
  const overridePolicy = applyMangabaClawExecPolicyLayer(basePolicy, params.execOverrides);
  const approvalFloors = resolveMangabaClawExecApprovalFloorsForCodexAppServer({
    approvals: params.approvals,
    agentId: params.agentId,
    policy: overridePolicy,
  });
  return applyMangabaClawExecApprovalFloors(overridePolicy, approvalFloors);
}

export function resolveEffectiveMangabaClawExecModeForCodexAppServer(params: {
  execMode?: MangabaClawExecMode;
  execPolicy?: MangabaClawExecPolicyForCodexAppServer;
}): MangabaClawExecMode | undefined {
  if (params.execPolicy?.touched === true) {
    return params.execPolicy.mode;
  }
  return params.execMode;
}

export function resolveCodexPolicyModeForMangabaClawExecMode(
  mode: MangabaClawExecMode | undefined,
): CodexAppServerPolicyMode | undefined {
  if (!mode || mode === "full") {
    return undefined;
  }
  return "guardian";
}

export function assertCodexAppServerAllowedForMangabaClawExecMode(
  mode: MangabaClawExecMode | undefined,
): void {
  if (mode === "deny" || mode === "allowlist") {
    throw new AgentHarnessPreflightError(
      `Codex app-server local execution is unavailable because effective tools.exec.mode=${mode}. ` +
        "Execution-host approvals are authoritative. For gateway turns, inspect them with `mangabaclaw approvals get --gateway` and update that same target with `mangabaclaw approvals set --gateway --stdin`; for local `agent exec`, omit `--gateway`. Intentionally align that host policy before retrying.",
      { scope: "harness" },
    );
  }
}

function createDefaultMangabaClawExecPolicy(): MangabaClawExecPolicy {
  return {
    ...resolveMangabaClawExecPolicyForMode("full"),
    touched: false,
  };
}

function applyMangabaClawExecPolicyLayer(
  base: MangabaClawExecPolicy,
  exec?: { mode?: unknown; security?: unknown; ask?: unknown },
): MangabaClawExecPolicy {
  if (!exec) {
    return base;
  }
  const mode = readExecMode(exec.mode);
  if (mode !== undefined) {
    return {
      ...resolveMangabaClawExecPolicyForMode(mode),
      touched: true,
    };
  }
  const security = readExecSecurity(exec.security);
  const ask = readExecAsk(exec.ask);
  if (security === undefined && ask === undefined) {
    return base;
  }
  const nextSecurity = security ?? base.security;
  const nextAsk = ask ?? base.ask;
  return {
    mode: resolveMangabaClawExecModeFromPolicy({ security: nextSecurity, ask: nextAsk }),
    security: nextSecurity,
    ask: nextAsk,
    touched: true,
  };
}

function resolveMangabaClawExecApprovalFloorsForCodexAppServer(params: {
  approvals?: ExecApprovalsFile;
  agentId?: string;
  policy: MangabaClawExecPolicy;
}): MangabaClawExecApprovalFloorsForCodexAppServer | undefined {
  if (!params.approvals) {
    return undefined;
  }
  return resolveExecApprovalsFromFile({
    file: params.approvals,
    agentId: params.agentId,
    overrides: {
      security: params.policy.security,
      ask: params.policy.ask,
    },
  }).agent;
}

function applyMangabaClawExecApprovalFloors(
  base: MangabaClawExecPolicy,
  approvalFloors?: MangabaClawExecApprovalFloorsForCodexAppServer,
): MangabaClawExecPolicy {
  if (!approvalFloors) {
    return base;
  }
  const nextSecurity = approvalFloors.security
    ? minMangabaClawExecSecurity(base.security, approvalFloors.security)
    : base.security;
  const nextAsk = approvalFloors.ask ? maxMangabaClawExecAsk(base.ask, approvalFloors.ask) : base.ask;
  if (nextSecurity === base.security && nextAsk === base.ask) {
    return base;
  }
  return {
    mode: resolveMangabaClawExecModeFromPolicy({ security: nextSecurity, ask: nextAsk }),
    security: nextSecurity,
    ask: nextAsk,
    touched: true,
  };
}

function resolveMangabaClawExecPolicyForMode(
  mode: MangabaClawExecMode,
): Omit<MangabaClawExecPolicy, "touched"> {
  switch (mode) {
    case "deny":
      return { mode, security: "deny", ask: "off" };
    case "allowlist":
      return { mode, security: "allowlist", ask: "off" };
    case "ask":
    case "auto":
      return { mode, security: "allowlist", ask: "on-miss" };
    case "full":
      return { mode, security: "full", ask: "off" };
  }
  const exhaustiveMode: never = mode;
  return exhaustiveMode;
}

function resolveMangabaClawExecModeFromPolicy(params: {
  security: MangabaClawExecSecurity;
  ask: MangabaClawExecAsk;
}): MangabaClawExecMode {
  if (params.security === "deny") {
    return "deny";
  }
  if (params.security === "allowlist" && params.ask === "off") {
    return "allowlist";
  }
  if (params.security === "full" && params.ask !== "always") {
    return "full";
  }
  return "ask";
}

function minMangabaClawExecSecurity(
  left: MangabaClawExecSecurity,
  right: MangabaClawExecSecurity,
): MangabaClawExecSecurity {
  const order: Record<MangabaClawExecSecurity, number> = { deny: 0, allowlist: 1, full: 2 };
  return order[left] <= order[right] ? left : right;
}

function maxMangabaClawExecAsk(left: MangabaClawExecAsk, right: MangabaClawExecAsk): MangabaClawExecAsk {
  const order: Record<MangabaClawExecAsk, number> = { off: 0, "on-miss": 1, always: 2 };
  return order[left] >= order[right] ? left : right;
}

function readExecMode(value: unknown): MangabaClawExecMode | undefined {
  return value === "deny" ||
    value === "allowlist" ||
    value === "ask" ||
    value === "auto" ||
    value === "full"
    ? value
    : undefined;
}
