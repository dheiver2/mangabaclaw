// Telegram API module exposes the plugin public contract.
import type { MangabaClawConfig } from "./runtime-api.js";
import { inspectTelegramAccount } from "./src/account-inspect.js";

export function inspectTelegramReadOnlyAccount(cfg: MangabaClawConfig, accountId?: string | null) {
  return inspectTelegramAccount({ cfg, accountId });
}
