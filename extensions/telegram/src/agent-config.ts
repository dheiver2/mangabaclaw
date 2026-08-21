// Telegram helper module supports agent config behavior.
import { resolveAgentConfig } from "mangabaclaw/plugin-sdk/agent-scope-runtime";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";

type ReasoningDefault = "on" | "stream" | "off";

export function resolveTelegramConfigReasoningDefault(
  cfg: MangabaClawConfig,
  agentId: string,
): ReasoningDefault {
  const agentDefault = resolveAgentConfig(cfg, agentId)?.reasoningDefault;
  return agentDefault ?? cfg.agents?.defaults?.reasoningDefault ?? "off";
}
