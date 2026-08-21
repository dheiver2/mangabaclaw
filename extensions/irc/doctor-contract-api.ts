// Irc API module exposes the plugin doctor contract.
import type {
  ChannelDoctorConfigMutation,
  ChannelDoctorLegacyConfigRule,
} from "mangabaclaw/plugin-sdk/channel-contract";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { defineChannelAliasMigration } from "mangabaclaw/plugin-sdk/runtime-doctor-migrations";

// IRC's nested streaming schema is delivery-only ({chunkMode, block}); it has
// no preview mode, so only the delivery flat aliases are legal legacy input.
// Account merge replaces the root streaming object wholesale
// (resolveMergedAccountConfig without a streaming deep-merge), so migration
// seeds materialized account objects with the inherited root settings.
const streamingAliasMigration = defineChannelAliasMigration({
  channelId: "irc",
  streaming: { defaultMode: "partial", deliveryOnly: true },
  accountStreamingReplacesRoot: true,
});

export const legacyConfigRules: ChannelDoctorLegacyConfigRule[] =
  streamingAliasMigration.legacyConfigRules;

export function normalizeCompatibilityConfig({
  cfg,
}: {
  cfg: MangabaClawConfig;
}): ChannelDoctorConfigMutation {
  return streamingAliasMigration.normalizeChannelConfig({ cfg });
}
