// Line API module exposes the plugin public contract.
import { DEFAULT_ACCOUNT_ID } from "mangabaclaw/plugin-sdk/account-id";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/account-resolution";
import type { ChannelPlugin } from "mangabaclaw/plugin-sdk/core";
import { listLineAccountIds, resolveDefaultLineAccountId, resolveLineAccount } from "./accounts.js";
import { resolveExactLineGroupConfigKey } from "./group-keys.js";
import type { LineConfig, ResolvedLineAccount } from "./types.js";
export { clearAccountEntryFields } from "mangabaclaw/plugin-sdk/core";

export {
  DEFAULT_ACCOUNT_ID,
  listLineAccountIds,
  resolveDefaultLineAccountId,
  resolveExactLineGroupConfigKey,
  resolveLineAccount,
};

export type { ChannelPlugin, LineConfig, MangabaClawConfig, ResolvedLineAccount };
