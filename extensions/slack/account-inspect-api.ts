// Slack API module exposes the plugin public contract.
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { inspectSlackAccount } from "./src/account-inspect.js";

export function inspectSlackReadOnlyAccount(cfg: MangabaClawConfig, accountId?: string | null) {
  return inspectSlackAccount({ cfg, accountId });
}
