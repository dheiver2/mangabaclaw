// Telegram helper module supports setup surface.helpers behavior.
import { createChannelDmPolicy } from "mangabaclaw/plugin-sdk/channel-dm-policy";
import {
  applySetupAccountConfigPatch,
  DEFAULT_ACCOUNT_ID,
  type MangabaClawConfig,
  patchChannelConfigForAccount,
} from "mangabaclaw/plugin-sdk/setup";
import { formatCliCommand, formatDocsLink } from "mangabaclaw/plugin-sdk/setup-tools";
import { normalizeOptionalString } from "mangabaclaw/plugin-sdk/string-coerce-runtime";
import {
  mergeTelegramAccountConfig,
  resolveDefaultTelegramAccountId,
  resolveTelegramAccount,
} from "./accounts.js";
import { promptTelegramAllowFromForAccount, telegramSetupAdapter } from "./setup-core.js";

const channel = "telegram" as const;

export function ensureTelegramDefaultGroupMentionGate(
  cfg: MangabaClawConfig,
  accountId: string,
): MangabaClawConfig {
  const resolved = resolveTelegramAccount({ cfg, accountId });
  const wildcardGroup = resolved.config.groups?.["*"];
  if (wildcardGroup?.requireMention !== undefined) {
    return cfg;
  }
  return patchChannelConfigForAccount({
    cfg,
    channel,
    accountId,
    patch: {
      groups: {
        ...resolved.config.groups,
        "*": {
          ...wildcardGroup,
          requireMention: true,
        },
      },
    },
    setupSurface: telegramSetupAdapter,
  });
}

export function shouldShowTelegramDmAccessWarning(cfg: MangabaClawConfig, accountId: string): boolean {
  const merged = mergeTelegramAccountConfig(cfg, accountId);
  const policy = merged.dmPolicy ?? "pairing";
  const hasAllowFrom =
    Array.isArray(merged.allowFrom) &&
    merged.allowFrom.some((entry) => normalizeOptionalString(String(entry)));
  return policy === "pairing" && !hasAllowFrom;
}

export function buildTelegramDmAccessWarningLines(accountId: string): string[] {
  const configBase =
    accountId === DEFAULT_ACCOUNT_ID
      ? "channels.telegram"
      : `channels.telegram.accounts.${accountId}`;
  return [
    "Your bot is using DM policy: pairing.",
    "Any Telegram user who discovers the bot can send pairing requests.",
    "For private use, configure an allowlist with your Telegram user id:",
    "  " + formatCliCommand(`mangabaclaw config set ${configBase}.dmPolicy "allowlist"`),
    "  " + formatCliCommand(`mangabaclaw config set ${configBase}.allowFrom '["YOUR_USER_ID"]'`),
    `Docs: ${formatDocsLink("/channels/pairing", "channels/pairing")}`,
  ];
}

export const telegramSetupDmPolicy = createChannelDmPolicy({
  label: "Telegram",
  channel,
  resolveAccount: (cfg, accountId) => {
    const resolvedAccountId = accountId ?? resolveDefaultTelegramAccountId(cfg);
    return {
      accountId: resolvedAccountId,
      config: mergeTelegramAccountConfig(cfg, resolvedAccountId),
    };
  },
  applyPatch: ({ cfg, requestedAccountId, account, patch }) =>
    requestedAccountId == null && account.accountId !== DEFAULT_ACCOUNT_ID
      ? applySetupAccountConfigPatch({
          cfg,
          channelKey: channel,
          accountId: account.accountId,
          patch,
        })
      : patchChannelConfigForAccount({
          cfg,
          channel,
          accountId: account.accountId,
          patch,
          setupSurface: telegramSetupAdapter,
        }),
  promptAllowFrom: promptTelegramAllowFromForAccount,
});
