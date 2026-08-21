// Telegram plugin module implements auto topic label behavior.
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { generateConversationLabel } from "mangabaclaw/plugin-sdk/reply-dispatch-runtime";
export { resolveAutoTopicLabelConfig } from "./auto-topic-label-config.js";

export async function generateTelegramTopicLabel(params: {
  userMessage: string;
  prompt: string;
  cfg: MangabaClawConfig;
  agentId?: string;
  agentDir?: string;
}): Promise<string | null> {
  return await generateConversationLabel({
    ...params,
    maxLength: 128,
  });
}
