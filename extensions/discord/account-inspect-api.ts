// Discord API module exposes the plugin public contract.
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { inspectDiscordAccount } from "./src/account-inspect.js";

export function inspectDiscordReadOnlyAccount(cfg: MangabaClawConfig, accountId?: string | null) {
  return inspectDiscordAccount({ cfg, accountId });
}
