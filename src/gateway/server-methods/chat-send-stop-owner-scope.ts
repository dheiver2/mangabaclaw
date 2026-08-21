import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import { tryResolveSessionCompatibilityOwnerAgentId } from "../session-request-agent.js";

export function resolveChatSendStopOwnerScope(params: {
  cfg: MangabaClawConfig;
  selectedAgentId?: string;
  sessionKey: string;
}): { agentId?: string; defaultAgentId?: string } {
  return {
    agentId: params.selectedAgentId,
    defaultAgentId: tryResolveSessionCompatibilityOwnerAgentId(params.cfg, params.sessionKey),
  };
}
