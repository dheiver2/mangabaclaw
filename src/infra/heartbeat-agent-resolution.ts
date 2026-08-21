import { tryResolveAmbientOwnerAgentId } from "../agents/agent-scope-config.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";

export function tryResolveAmbientHeartbeatAgentId(cfg: MangabaClawConfig): string | undefined {
  return tryResolveAmbientOwnerAgentId(cfg, cfg.agents?.defaults?.heartbeat?.agentId);
}
