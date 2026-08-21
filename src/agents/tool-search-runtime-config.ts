// Applies Tool Search overlays on top of the selected runtime config.
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { applyLocalModelLeanToolSearchDefaults } from "./local-model-lean.js";
import { resolveAgentRuntimeToolConfig } from "./tool-runtime-config.js";

export function resolveAgentToolSearchRuntimeConfig(params: {
  config?: MangabaClawConfig;
  agentId?: string;
  sessionKey?: string;
  forceDirectMessageTool?: boolean;
}): MangabaClawConfig | undefined {
  // Select before overlay cloning; cloning source config first loses snapshot identity and can
  // reintroduce unresolved SecretRefs into plugin tool factories.
  const runtimeConfig = resolveAgentRuntimeToolConfig(params.config);
  if (params.forceDirectMessageTool) {
    return runtimeConfig;
  }
  return applyLocalModelLeanToolSearchDefaults({
    config: runtimeConfig,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
  });
}
