// Imessage plugin module implements account types behavior.
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";

export type IMessageAccountConfig = Omit<
  NonNullable<NonNullable<MangabaClawConfig["channels"]>["imessage"]>,
  "accounts" | "defaultAccount"
>;
