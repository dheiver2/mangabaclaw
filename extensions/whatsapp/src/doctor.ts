// Whatsapp plugin module implements doctor behavior.
import type {
  ChannelDoctorAdapter,
  ChannelDoctorConfigMutation,
} from "mangabaclaw/plugin-sdk/channel-contract";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";

export function normalizeCompatibilityConfig({
  cfg,
}: {
  cfg: MangabaClawConfig;
}): ChannelDoctorConfigMutation {
  return { config: cfg, changes: [] };
}

export const whatsappDoctor: ChannelDoctorAdapter = {
  normalizeCompatibilityConfig,
};
