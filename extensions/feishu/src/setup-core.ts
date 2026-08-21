import { defineChannelSetupContract } from "mangabaclaw/plugin-sdk/channel-setup";
// Feishu plugin module implements setup core behavior.
import {
  DEFAULT_ACCOUNT_ID,
  type ChannelSetupAdapter,
  type MangabaClawConfig,
} from "mangabaclaw/plugin-sdk/setup";
import { resolveDefaultFeishuAccountId } from "./accounts.js";
import type { FeishuConfig } from "./types.js";

export function setFeishuNamedAccountEnabled(
  cfg: MangabaClawConfig,
  accountId: string,
  enabled: boolean,
): MangabaClawConfig {
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...feishuCfg,
        accounts: {
          ...feishuCfg?.accounts,
          [accountId]: {
            ...feishuCfg?.accounts?.[accountId],
            enabled,
          },
        },
      },
    },
  };
}

export const feishuSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ cfg, accountId }) => accountId?.trim() || resolveDefaultFeishuAccountId(cfg),
  applyAccountConfig: ({ cfg, accountId }) => {
    const isDefault = !accountId || accountId === DEFAULT_ACCOUNT_ID;
    if (isDefault) {
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          feishu: {
            ...cfg.channels?.feishu,
            enabled: true,
          },
        },
      };
    }
    return setFeishuNamedAccountEnabled(cfg, accountId, true);
  },
};

export const feishuSetupContract = defineChannelSetupContract({
  fields: {},
  legacyAdapter: feishuSetupAdapter,
});
