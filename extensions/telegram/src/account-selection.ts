// Telegram plugin module implements account selection behavior.
import {
  createAccountListHelpers,
  hasConfiguredAccountValue,
  resolveListedDefaultAccountId,
} from "mangabaclaw/plugin-sdk/account-core";
import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "mangabaclaw/plugin-sdk/account-id";
import { listAgentIds, resolveDefaultAgentId } from "mangabaclaw/plugin-sdk/agent-scope-runtime";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { normalizeAgentId } from "mangabaclaw/plugin-sdk/routing";
import { normalizeLowercaseStringOrEmpty } from "mangabaclaw/plugin-sdk/string-coerce-runtime";

function resolveBindingAccount(params: {
  binding: unknown;
  channelId: string;
}): { agentId: string; accountId: string } | null {
  if (!params.binding || typeof params.binding !== "object") {
    return null;
  }
  const binding = params.binding as {
    agentId?: unknown;
    match?: { channel?: unknown; accountId?: unknown };
  };
  if (normalizeLowercaseStringOrEmpty(binding.match?.channel) !== params.channelId) {
    return null;
  }
  const accountId = typeof binding.match?.accountId === "string" ? binding.match.accountId : "";
  if (!accountId.trim() || accountId.trim() === "*") {
    return null;
  }
  return {
    agentId: normalizeAgentId(typeof binding.agentId === "string" ? binding.agentId : undefined),
    accountId: normalizeAccountId(accountId),
  };
}

function listBoundAccountIds(cfg: MangabaClawConfig, channelId: string): string[] {
  const ids = new Set<string>();
  for (const binding of cfg.bindings ?? []) {
    const resolved = resolveBindingAccount({ binding, channelId });
    if (resolved) {
      ids.add(resolved.accountId);
    }
  }
  return [...ids].toSorted((left, right) => left.localeCompare(right));
}

function resolveDefaultAgentBoundAccountId(cfg: MangabaClawConfig, channelId: string): string | null {
  if (cfg.agents?.ownership === "explicit" && listAgentIds(cfg).length !== 1) {
    return null;
  }
  const defaultAgentId = resolveDefaultAgentId(cfg);
  for (const binding of cfg.bindings ?? []) {
    const resolved = resolveBindingAccount({ binding, channelId });
    if (resolved?.agentId === defaultAgentId) {
      return resolved.accountId;
    }
  }
  return null;
}

function hasImplicitDefaultTelegramAccount(cfg: MangabaClawConfig): boolean {
  const telegram = cfg.channels?.telegram;
  if (!telegram) {
    return false;
  }
  return (
    hasConfiguredAccountValue(telegram.botToken) ||
    hasConfiguredAccountValue(telegram.tokenFile) ||
    hasConfiguredAccountValue(process.env.TELEGRAM_BOT_TOKEN)
  );
}

const { listAccountIds: listTelegramAccountIds } = createAccountListHelpers("telegram", {
  normalizeAccountId,
  additionalAccountIds: (cfg) => listBoundAccountIds(cfg, "telegram"),
  hasImplicitDefaultAccount: hasImplicitDefaultTelegramAccount,
});

export { listTelegramAccountIds };

export function resolveDefaultTelegramAccountSelection(cfg: MangabaClawConfig): {
  accountId: string;
  accountIds: string[];
  shouldWarnMissingDefault: boolean;
} {
  const boundDefault = resolveDefaultAgentBoundAccountId(cfg, "telegram");
  if (boundDefault) {
    return {
      accountId: boundDefault,
      accountIds: listTelegramAccountIds(cfg),
      shouldWarnMissingDefault: false,
    };
  }
  const accountIds = listTelegramAccountIds(cfg);
  const configuredDefaultAccountId =
    normalizeOptionalAccountId(cfg.channels?.telegram?.defaultAccount) ?? undefined;
  const hasExplicitDefaultAccount = configuredDefaultAccountId
    ? accountIds.includes(configuredDefaultAccountId)
    : false;
  const resolved = resolveListedDefaultAccountId({
    accountIds,
    configuredDefaultAccountId,
  });
  return {
    accountId: resolved,
    accountIds,
    shouldWarnMissingDefault:
      resolved === accountIds[0] &&
      !hasExplicitDefaultAccount &&
      !accountIds.includes(DEFAULT_ACCOUNT_ID) &&
      accountIds.length > 1,
  };
}

export function resolveDefaultTelegramAccountId(cfg: MangabaClawConfig): string {
  return resolveDefaultTelegramAccountSelection(cfg).accountId;
}
