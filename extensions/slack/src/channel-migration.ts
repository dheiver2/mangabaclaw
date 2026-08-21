// Slack plugin module implements channel migration behavior.
import type { MangabaClawConfig, SlackChannelConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { normalizeAccountId } from "mangabaclaw/plugin-sdk/routing";
import { normalizeLowercaseStringOrEmpty } from "mangabaclaw/plugin-sdk/string-coerce-runtime";

type SlackChannels = Record<string, SlackChannelConfig>;

type MigrationScope = "account" | "global";

type SlackChannelMigrationResult = {
  migrated: boolean;
  skippedExisting: boolean;
  scopes: MigrationScope[];
};

function resolveAccountChannels(
  cfg: MangabaClawConfig,
  accountId?: string | null,
): { channels?: SlackChannels } {
  if (!accountId) {
    return {};
  }
  const normalized = normalizeAccountId(accountId);
  const accounts = cfg.channels?.slack?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return {};
  }
  const exact = accounts[normalized];
  if (exact?.channels) {
    return { channels: exact.channels };
  }
  const matchKey = Object.keys(accounts).find(
    (key) => normalizeLowercaseStringOrEmpty(key) === normalizeLowercaseStringOrEmpty(normalized),
  );
  return { channels: matchKey ? accounts[matchKey]?.channels : undefined };
}

function migrateSlackChannelsInPlace(
  channels: SlackChannels | undefined,
  oldChannelId: string,
  newChannelId: string,
): { migrated: boolean; skippedExisting: boolean } {
  if (!channels) {
    return { migrated: false, skippedExisting: false };
  }
  if (oldChannelId === newChannelId) {
    return { migrated: false, skippedExisting: false };
  }
  if (!Object.hasOwn(channels, oldChannelId)) {
    return { migrated: false, skippedExisting: false };
  }
  if (Object.hasOwn(channels, newChannelId)) {
    return { migrated: false, skippedExisting: true };
  }
  const channelConfig = channels[oldChannelId];
  if (!channelConfig) {
    return { migrated: false, skippedExisting: false };
  }
  channels[newChannelId] = channelConfig;
  delete channels[oldChannelId];
  return { migrated: true, skippedExisting: false };
}

export function migrateSlackChannelConfig(params: {
  cfg: MangabaClawConfig;
  accountId?: string | null;
  oldChannelId: string;
  newChannelId: string;
}): SlackChannelMigrationResult {
  const scopes: MigrationScope[] = [];
  let migrated = false;
  let skippedExisting = false;

  const accountChannels = resolveAccountChannels(params.cfg, params.accountId).channels;
  if (accountChannels) {
    const result = migrateSlackChannelsInPlace(
      accountChannels,
      params.oldChannelId,
      params.newChannelId,
    );
    if (result.migrated) {
      migrated = true;
      scopes.push("account");
    }
    if (result.skippedExisting) {
      skippedExisting = true;
    }
  }

  const globalChannels = params.cfg.channels?.slack?.channels;
  if (globalChannels) {
    const result = migrateSlackChannelsInPlace(
      globalChannels,
      params.oldChannelId,
      params.newChannelId,
    );
    if (result.migrated) {
      migrated = true;
      scopes.push("global");
    }
    if (result.skippedExisting) {
      skippedExisting = true;
    }
  }

  return { migrated, skippedExisting, scopes };
}
