/**
 * Tool loop-detection config resolver.
 * Overlays per-agent loop detection settings on global tool defaults while
 * preserving the per-agent enabled override.
 */
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import type { ToolLoopDetectionConfig } from "../config/types.tools.js";
import { resolveAgentConfig } from "./agent-scope.js";

/** Resolves effective tool loop-detection config by overlaying agent settings on globals. */
export function resolveToolLoopDetectionConfig(params: {
  cfg?: MangabaClawConfig;
  agentId?: string;
}): ToolLoopDetectionConfig | undefined {
  const global = params.cfg?.tools?.loopDetection;
  const agent =
    params.agentId && params.cfg
      ? resolveAgentConfig(params.cfg, params.agentId)?.tools?.loopDetection
      : undefined;

  if (!agent) {
    return global;
  }
  if (!global) {
    return agent;
  }

  return { enabled: agent.enabled ?? global.enabled };
}
