import { normalizeAgentId } from "@mangabaclaw/normalization-core/agent-id";
import { listAgentIds } from "../../agents/agent-scope-config.js";
import { classifySessionKeyShape } from "../../routing/session-key.js";
import type { MangabaClawConfig } from "../types.mangabaclaw.js";
import {
  isPerAgentSessionStoreConfig,
  isSameFixedSessionStoreConfig,
} from "./session-store-config.js";

export type PersistedSessionStoreOwner =
  | { kind: "none" }
  | { kind: "configured"; agentId: string }
  | { kind: "retired"; agentId: string };

/** Preserves a retired fixed-store owner as an explicit unavailable state. */
export function resolvePersistedSessionStoreOwner(
  config: MangabaClawConfig,
): PersistedSessionStoreOwner {
  if (isPerAgentSessionStoreConfig(config.session?.store)) {
    return { kind: "none" };
  }
  const persistedAgentId = config.agents?.defaults?.sessionStore?.agentId?.trim();
  if (!persistedAgentId) {
    return { kind: "none" };
  }
  const agentId = normalizeAgentId(persistedAgentId);
  return listAgentIds(config).some(
    (configuredAgentId) => normalizeAgentId(configuredAgentId) === agentId,
  )
    ? { kind: "configured", agentId }
    : { kind: "retired", agentId };
}

/** Applies fixed-store ownership only to keys without an agent-qualified namespace. */
export function resolvePersistedSessionStoreOwnerForKey(
  config: MangabaClawConfig,
  sessionKey: string | undefined,
): PersistedSessionStoreOwner {
  return classifySessionKeyShape(sessionKey) === "legacy_or_alias"
    ? resolvePersistedSessionStoreOwner(config)
    : { kind: "none" };
}

/** Applies fixed-store ownership only when the concrete write target is that configured store. */
export function resolvePersistedSessionStoreOwnerForTarget(params: {
  config: MangabaClawConfig;
  sessionKey: string | undefined;
  storePath?: string;
  env?: NodeJS.ProcessEnv;
}): PersistedSessionStoreOwner {
  const owner = resolvePersistedSessionStoreOwnerForKey(params.config, params.sessionKey);
  if (owner.kind === "none" || !params.storePath) {
    return owner;
  }
  return isSameFixedSessionStoreConfig(
    params.config.session?.store,
    params.storePath,
    params.env ?? process.env,
  )
    ? owner
    : { kind: "none" };
}
