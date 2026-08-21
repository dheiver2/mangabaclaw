// Memory Host SDK helper module supports config utils behavior.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeAgentId } from "@mangabaclaw/normalization-core/agent-id";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "@mangabaclaw/normalization-core/string-coerce";
import type { MemoryExtraPath } from "./types.js";
export { normalizeAgentId };

// Shared MangabaClaw config helpers used by memory host and agent context code.

type DmScope = "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";
/** Citation injection behavior for memory search results. */
export type MemoryCitationsMode = "auto" | "on" | "off";

/** Top-level memory config shared by host and runtime callers. */
type MemoryConfig = {
  citations?: MemoryCitationsMode;
  search?: MemorySearchConfig;
};

/** Per-agent memory search enablement and extra collection paths. */
type MemorySearchConfig = {
  enabled?: boolean;
  rememberAcrossConversations?: boolean;
  extraPaths?: MemoryExtraPath[];
};

/** Trim and deduplicate configured extra-memory roots without losing pattern identity. */
export function normalizeConfiguredMemoryExtraPaths(
  extraPaths?: MemoryExtraPath[],
): MemoryExtraPath[] {
  const normalized = new Map<string, MemoryExtraPath>();
  for (const entry of extraPaths ?? []) {
    const configuredPath = (typeof entry === "string" ? entry : entry.path).trim();
    const pattern = typeof entry === "string" ? "" : entry.pattern?.trim() || "";
    if (configuredPath) {
      normalized.set(
        `${configuredPath}\0${pattern}`,
        pattern ? { path: configuredPath, pattern } : configuredPath,
      );
    }
  }
  return Array.from(normalized.values());
}

/** Agent context limits that bound memory file reads. */
type AgentContextLimitsConfig = {
  memoryGetMaxChars?: number;
};

/** Secret reference accepted by provider header config. */
type SecretInput =
  | string
  | {
      source: string;
      provider: string;
      id: string;
    };

/** Agent-level config fields consumed by memory host helpers. */
type AgentConfig = {
  id?: string;
  default?: boolean;
  workspace?: string;
  memory?: {
    search?: MemorySearchConfig;
  };
  contextLimits?: AgentContextLimitsConfig;
};

/** Narrow MangabaClaw config shape consumed by memory host utilities. */
export type MangabaClawConfig = {
  agents?: {
    defaults?: {
      workspace?: string;
      contextLimits?: AgentContextLimitsConfig;
    };
    entries?: Record<string, Omit<AgentConfig, "id">>;
    list?: AgentConfig[];
  };
  session?: {
    dmScope?: DmScope;
  };
  bindings?: unknown[];
  memory?: MemoryConfig;
  models?: {
    providers?: Record<
      string,
      {
        api?: string;
        baseUrl?: string;
        headers?: Record<string, SecretInput>;
      }
    >;
  };
};

export function resolveRememberAcrossConversations(cfg: MangabaClawConfig, agentId: string): boolean {
  const defaults = cfg.memory?.search;
  const overrides = resolveAgentConfig(cfg, agentId)?.memory?.search;
  const explicit = overrides?.rememberAcrossConversations ?? defaults?.rememberAcrossConversations;
  if (explicit !== undefined) {
    return explicit;
  }
  // Recall is per-agent/private-shaped, not per-sender. Any DM isolation signals a
  // multi-user install, where silently recalling across senders would leak context.
  return (
    (cfg.session?.dmScope === undefined || cfg.session.dmScope === "main") &&
    !cfg.bindings?.some((binding) => {
      if (!binding || typeof binding !== "object") {
        return false;
      }
      const session = (binding as { session?: unknown }).session;
      return (
        Boolean(session) &&
        typeof session === "object" &&
        (session as { dmScope?: unknown }).dmScope !== undefined
      );
    })
  );
}

/** Root memory filename used in agent workspaces. */
export const MEMORY_HOST_ROOT_FILENAME = "MEMORY.md";

const DEFAULT_AGENT_ID = "main";
const LEGACY_STATE_DIRNAMES = [".clawdbot"] as const;
const NEW_STATE_DIRNAME = ".mangabaclaw";
/** Treat shell-placeholder home values as absent. */
function normalizeHomeValue(value: string | undefined): string | undefined {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed || trimmed === "undefined" || trimmed === "null") {
    return undefined;
  }
  return trimmed;
}

/** Resolve the underlying OS home before applying MangabaClaw-specific overrides. */
function resolveRawOsHomeDir(env: NodeJS.ProcessEnv, homedir: () => string): string | undefined {
  return (
    normalizeHomeValue(env.HOME) ??
    normalizeHomeValue(env.USERPROFILE) ??
    normalizeHomeValue(homedir())
  );
}

/** Resolve MANGABACLAW_HOME or the OS home, falling back to cwd for hermetic tests. */
function resolveRequiredHomeDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const explicitHome = normalizeHomeValue(env.MANGABACLAW_HOME);
  const rawHome = explicitHome
    ? explicitHome.replace(/^~(?=$|[\\/])/, resolveRawOsHomeDir(env, homedir) ?? "")
    : resolveRawOsHomeDir(env, homedir);
  return rawHome ? path.resolve(rawHome) : path.resolve(process.cwd());
}

/** Resolve standalone memory-host paths without importing core home-directory policy. */
function resolveMemoryHostUserPath(
  input: string,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("~")) {
    return path.resolve(trimmed.replace(/^~(?=$|[\\/])/, resolveRequiredHomeDir(env, homedir)));
  }
  return path.resolve(trimmed);
}

/** Return legacy state roots in priority order. */
function legacyStateDirs(homedir: () => string): string[] {
  return LEGACY_STATE_DIRNAMES.map((dir) => path.join(homedir(), dir));
}

function isFastTestRuntimeEnv(env: NodeJS.ProcessEnv): boolean {
  const isTestRuntime =
    env.VITEST === "true" ||
    env.VITEST === "1" ||
    env.VITEST_POOL_ID !== undefined ||
    env.VITEST_WORKER_ID !== undefined ||
    env.NODE_ENV === "test" ||
    (env !== process.env &&
      (process.env.VITEST === "true" ||
        process.env.VITEST === "1" ||
        process.env.VITEST_POOL_ID !== undefined ||
        process.env.VITEST_WORKER_ID !== undefined ||
        process.env.NODE_ENV === "test"));
  return isTestRuntime && env.MANGABACLAW_TEST_FAST === "1";
}

/** Resolve the current state root while preserving shipped legacy installs when present. */
function resolveStateDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const override = env.MANGABACLAW_STATE_DIR?.trim();
  if (override) {
    return resolveMemoryHostUserPath(override, env, homedir);
  }
  const effectiveHome = () => resolveRequiredHomeDir(env, homedir);
  const nextDir = path.join(effectiveHome(), NEW_STATE_DIRNAME);
  if (isFastTestRuntimeEnv(env) || fs.existsSync(nextDir)) {
    return nextDir;
  }
  // Remove after 2026-10-01: drop legacy state-dir precedence once an explicit migration creates .mangabaclaw.
  const existingLegacy = legacyStateDirs(effectiveHome).find((dir) => {
    try {
      return fs.existsSync(dir);
    } catch {
      return false;
    }
  });
  return existingLegacy ?? nextDir;
}

/** Resolve the default agent workspace, partitioned by MANGABACLAW_PROFILE when set. */
function resolveDefaultAgentWorkspaceDir(env: NodeJS.ProcessEnv = process.env): string {
  const workspaceDir = env.MANGABACLAW_WORKSPACE_DIR?.trim();
  if (workspaceDir) {
    return resolveMemoryHostUserPath(workspaceDir, env);
  }
  if (env.MANGABACLAW_STATE_DIR?.trim()) {
    return path.join(resolveStateDir(env), "workspace");
  }
  const home = resolveRequiredHomeDir(env, os.homedir);
  const profile = env.MANGABACLAW_PROFILE?.trim();
  if (profile && normalizeLowercaseStringOrEmpty(profile) !== "default") {
    return path.join(resolveStateDir(env), "workspace");
  }
  return path.join(home, ".mangabaclaw", "workspace");
}

/** Return configured agent entries after dropping nullish placeholders. */
function listAgentEntries(cfg: MangabaClawConfig): AgentConfig[] {
  if (cfg.agents?.entries) {
    return Object.entries(cfg.agents.entries).map(([id, entry]) => Object.assign({ id }, entry));
  }
  return Array.isArray(cfg.agents?.list)
    ? cfg.agents.list.filter((entry): entry is AgentConfig => Boolean(entry))
    : [];
}

/** Resolve the default agent id from explicit default marker or first agent entry. */
function resolveDefaultAgentId(cfg: MangabaClawConfig): string {
  const agents = listAgentEntries(cfg);
  if (agents.length === 0) {
    return DEFAULT_AGENT_ID;
  }
  const chosen = (agents.find((agent) => agent.default) ?? agents[0])?.id;
  return normalizeAgentId(chosen || DEFAULT_AGENT_ID);
}

/** Find one agent config by canonical id. */
function resolveAgentConfig(cfg: MangabaClawConfig, agentId: string): AgentConfig | undefined {
  const id = normalizeAgentId(agentId);
  return listAgentEntries(cfg).find((entry) => normalizeAgentId(entry.id) === id);
}

/** Remove null bytes before paths are handed to filesystem APIs. */
function stripNullBytes(value: string): string {
  return value.replaceAll("\0", "");
}

/** Resolve the workspace directory for an agent id and config defaults. */
export function resolveMemoryHostAgentWorkspaceDir(
  cfg: MangabaClawConfig,
  agentId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const id = normalizeAgentId(agentId);
  const configured = resolveAgentConfig(cfg, id)?.workspace?.trim();
  if (configured) {
    return stripNullBytes(resolveMemoryHostUserPath(configured, env));
  }
  const fallback = cfg.agents?.defaults?.workspace?.trim();
  if (id === resolveDefaultAgentId(cfg)) {
    return stripNullBytes(
      fallback ? resolveMemoryHostUserPath(fallback, env) : resolveDefaultAgentWorkspaceDir(env),
    );
  }
  if (fallback) {
    return stripNullBytes(path.join(resolveMemoryHostUserPath(fallback, env), id));
  }
  return stripNullBytes(path.join(resolveStateDir(env), `workspace-${id}`));
}

/** Resolve context limits for an agent with defaults fallback. */
export function resolveMemoryHostAgentContextLimits(
  cfg: MangabaClawConfig | undefined,
  agentId?: string | null,
): AgentContextLimitsConfig | undefined {
  const defaults = cfg?.agents?.defaults?.contextLimits;
  if (!cfg || !agentId) {
    return defaults;
  }
  return resolveAgentConfig(cfg, agentId)?.contextLimits ?? defaults;
}

/** Resolve enabled memory search config plus deduplicated extra paths for an agent. */
export function resolveMemoryHostSearchPathConfig(
  cfg: MangabaClawConfig,
  agentId: string,
): {
  enabled: boolean;
  rememberAcrossConversations: boolean;
  extraPaths: MemoryExtraPath[];
} | null {
  const defaults = cfg.memory?.search;
  const overrides = resolveAgentConfig(cfg, agentId)?.memory?.search;
  const enabled = overrides?.enabled ?? defaults?.enabled ?? true;
  if (!enabled) {
    return null;
  }
  const extraPaths = normalizeConfiguredMemoryExtraPaths([
    ...(defaults?.extraPaths ?? []),
    ...(overrides?.extraPaths ?? []),
  ]);
  return {
    enabled,
    rememberAcrossConversations: resolveRememberAcrossConversations(cfg, agentId),
    extraPaths,
  };
}
