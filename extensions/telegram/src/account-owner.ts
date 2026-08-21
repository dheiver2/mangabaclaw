import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { resolveAgentRoute } from "mangabaclaw/plugin-sdk/routing";

/** Resolves the agent that owns account-scoped Telegram runtime state. */
export function resolveTelegramAccountOwnerAgentId(params: {
  cfg: MangabaClawConfig;
  accountId?: string | null;
}): string {
  return resolveAgentRoute({
    cfg: params.cfg,
    channel: "telegram",
    accountId: params.accountId,
  }).agentId;
}
