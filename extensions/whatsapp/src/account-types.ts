// Whatsapp plugin module implements account types behavior.
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";

export type WhatsAppAccountConfig = NonNullable<
  NonNullable<NonNullable<MangabaClawConfig["channels"]>["whatsapp"]>["accounts"]
>[string];
