// Whatsapp plugin module implements channel actions behavior.
import { createActionGate } from "mangabaclaw/plugin-sdk/channel-actions";
import type { ChannelMessageActionName } from "mangabaclaw/plugin-sdk/channel-contract";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";

export { listWhatsAppAccountIds, resolveWhatsAppAccount } from "./accounts.js";
export { resolveWhatsAppReactionLevel } from "./reaction-level.js";
export { createActionGate, type ChannelMessageActionName, type MangabaClawConfig };
