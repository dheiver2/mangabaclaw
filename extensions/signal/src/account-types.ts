// Signal plugin module implements account types behavior.
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";

type SignalChannelConfig = Exclude<NonNullable<MangabaClawConfig["channels"]>["signal"], undefined>;

export type SignalAccountConfig = Omit<SignalChannelConfig, "accounts" | "defaultAccount">;

export type SignalTransportConfig = NonNullable<SignalChannelConfig["transport"]>;
