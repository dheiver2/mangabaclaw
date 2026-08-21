// Resolves one concrete agent owner for onboarding auth, model, workspace, and session effects.
import {
  listAgentEntries,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveMutableAgentEntry,
  resolveSoleAgentId,
  toAgentEntriesRecord,
} from "../agents/agent-scope-config.js";
import { tryResolveLegacyCompatibilityAgentId } from "../config/legacy.default-agent-owner.js";
import {
  normalizeAgentModelMapForConfig,
  normalizeAgentModelRefForConfig,
  resolveAgentModelFallbackValues,
} from "../config/model-input.js";
import type { OptionalBootstrapFileName } from "../config/types.agent-defaults.js";
import type { AgentEntryConfig } from "../config/types.agents.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { formatErrorMessage } from "../infra/errors.js";
import { applyPrimaryModel } from "../plugins/provider-model-primary.js";
import { normalizeAgentId } from "../routing/session-key.js";
import type { RuntimeEnv } from "../runtime.js";
import { shortenHomePath } from "../utils.js";
import { ensureWorkspaceAndSessions } from "./onboard-helpers.js";

export type OnboardingAgentTarget = {
  agentId: string;
  agentDir: string;
  workspaceDir: string;
};

export function resolveOnboardingAgentTarget(
  config: MangabaClawConfig,
  explicitAgentId?: string,
): OnboardingAgentTarget {
  const agentId = normalizeAgentId(
    explicitAgentId ?? tryResolveLegacyCompatibilityAgentId(config) ?? resolveSoleAgentId(config),
  );
  return {
    agentId,
    agentDir: resolveAgentDir(config, agentId),
    workspaceDir: resolveAgentWorkspaceDir(config, agentId),
  };
}

/** Resolve the configured System Agent as the owner of onboarding effects. */
export function resolveSystemAgentOnboardingTarget(config: MangabaClawConfig): OnboardingAgentTarget {
  return resolveOnboardingAgentTarget(config, config.agents?.defaults?.systemAgent?.agentId);
}

/** Resolve onboarding setup to the system agent only for explicitly owned fleets. */
export function resolveOnboardingSetupTarget(config: MangabaClawConfig): OnboardingAgentTarget {
  return config.agents?.ownership === "explicit"
    ? resolveSystemAgentOnboardingTarget(config)
    : resolveOnboardingAgentTarget(config);
}

export async function ensureOnboardingAgentWorkspace(
  target: OnboardingAgentTarget,
  runtime: RuntimeEnv,
  options?: {
    skipBootstrap?: boolean;
    skipOptionalBootstrapFiles?: OptionalBootstrapFileName[];
  },
): Promise<{ bootstrapPending: boolean }> {
  try {
    return await ensureWorkspaceAndSessions(target.workspaceDir, runtime, {
      ...options,
      agentId: target.agentId,
    });
  } catch (error) {
    throw new Error(
      `Workspace provisioning for agent "${target.agentId}" at ${shortenHomePath(target.workspaceDir)} failed: ${formatErrorMessage(error)}`,
      { cause: error },
    );
  }
}

function replaceOnboardingAgentEntry(
  config: MangabaClawConfig,
  updated: MangabaClawConfig,
  target: OnboardingAgentTarget,
  nextEntry: AgentEntryConfig,
): MangabaClawConfig {
  const entries = listAgentEntries(config);
  const index = entries.findIndex((entry) => normalizeAgentId(entry.id) === target.agentId);
  const nextEntries = [...entries];
  const replacement = { id: index >= 0 ? entries[index]!.id : target.agentId, ...nextEntry };
  if (index >= 0) {
    nextEntries[index] = replacement;
  } else {
    nextEntries.push(replacement);
  }
  const { list: _list, entries: _entries, ...agents } = config.agents ?? {};
  return {
    ...updated,
    agents: {
      ...agents,
      entries: toAgentEntriesRecord(nextEntries),
    },
  };
}

export function applyOnboardingPrimaryModel(
  config: MangabaClawConfig,
  target: OnboardingAgentTarget,
  model: string,
): MangabaClawConfig {
  const entry = resolveMutableAgentEntry(config, target.agentId);
  if (entry?.model === undefined && config.agents?.ownership !== "explicit") {
    return applyPrimaryModel(config, model);
  }

  const primary = normalizeAgentModelRefForConfig(model);
  const fallbackValues = resolveAgentModelFallbackValues(entry?.model).map((fallback) =>
    normalizeAgentModelRefForConfig(fallback),
  );
  const models = normalizeAgentModelMapForConfig(entry?.models ?? {});
  return replaceOnboardingAgentEntry(config, config, target, {
    ...entry,
    model: {
      ...(fallbackValues.length > 0 ? { fallbacks: fallbackValues } : {}),
      primary,
    },
    models: {
      ...models,
      [primary]: models[primary] ?? {},
    },
  });
}

/** Apply a model-default mutation to one agent without flattening it globally. */
export function applyAgentModelDefaults(
  config: MangabaClawConfig,
  target: OnboardingAgentTarget,
  mutate: (config: MangabaClawConfig) => MangabaClawConfig,
): MangabaClawConfig {
  const entry = resolveMutableAgentEntry(config, target.agentId);
  const projected = {
    ...config,
    agents: {
      ...config.agents,
      defaults: {
        ...config.agents?.defaults,
        ...(entry?.model !== undefined ? { model: entry.model } : {}),
        ...(entry?.models !== undefined ? { models: entry.models } : {}),
        ...(entry?.modelPolicy !== undefined ? { modelPolicy: entry.modelPolicy } : {}),
      },
    },
  };
  return projectAgentModelDefaults(config, target, mutate(projected));
}

/** Move a defaults-based model mutation onto one agent while preserving its other config changes. */
export function projectAgentModelDefaults(
  config: MangabaClawConfig,
  target: OnboardingAgentTarget,
  updated: MangabaClawConfig,
): MangabaClawConfig {
  const entry = resolveMutableAgentEntry(config, target.agentId);
  if (!entry && config.agents?.ownership !== "explicit") {
    return updated;
  }
  const updatedDefaults = updated.agents?.defaults;
  const { model: _model, models: _models, modelPolicy: _modelPolicy, ...entryRest } = entry ?? {};
  const nextEntry = {
    ...entryRest,
    ...(updatedDefaults?.model !== undefined ? { model: updatedDefaults.model } : {}),
    ...(updatedDefaults?.models !== undefined ? { models: updatedDefaults.models } : {}),
    ...(updatedDefaults?.modelPolicy !== undefined
      ? { modelPolicy: updatedDefaults.modelPolicy }
      : {}),
  };
  return replaceOnboardingAgentEntry(config, updated, target, nextEntry);
}
