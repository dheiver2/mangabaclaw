import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";

export function resolveZalouserDmSessionScope(config: MangabaClawConfig) {
  const configured = config.session?.dmScope;
  return configured === "main" || !configured ? "per-channel-peer" : configured;
}
