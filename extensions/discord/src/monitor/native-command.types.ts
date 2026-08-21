// Discord type declarations define plugin contracts.
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import type { CommandArgValues } from "mangabaclaw/plugin-sdk/native-command-registry";

export type DiscordConfig = NonNullable<MangabaClawConfig["channels"]>["discord"];

export type DiscordCommandArgs = {
  raw?: string;
  values?: CommandArgValues;
};
