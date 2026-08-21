// Irc plugin module implements outbound base behavior.
import { sanitizeForPlainText } from "mangabaclaw/plugin-sdk/channel-outbound";
import { sanitizeAssistantVisibleText } from "mangabaclaw/plugin-sdk/text-chunking";
import { chunkTextForOutbound } from "./channel-api.js";

export function sanitizeIrcAssistantText(text: string): string {
  return sanitizeForPlainText(sanitizeAssistantVisibleText(text));
}

export const ircOutboundBaseAdapter = {
  deliveryMode: "direct" as const,
  chunker: chunkTextForOutbound,
  chunkerMode: "markdown" as const,
  textChunkLimit: 350,
  // IRC's plain-text pass does not remove assistant scaffolding. Run the
  // canonical delivery sanitizer first so internal tool traces are dropped
  // before channel formatting.
  sanitizeText: ({ text }: { text: string }) => sanitizeIrcAssistantText(text),
};
