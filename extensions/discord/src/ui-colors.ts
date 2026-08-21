// Discord plugin module implements ui colors behavior.
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";

const DEFAULT_DISCORD_ACCENT_COLOR = "#5865F2";

type ResolveDiscordAccentColorParams = {
  cfg: MangabaClawConfig;
  accountId?: string | null;
};

export function normalizeDiscordAccentColor(raw?: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }
  return normalized.toUpperCase();
}

export function resolveDiscordAccentColor(_params: ResolveDiscordAccentColorParams): string {
  return DEFAULT_DISCORD_ACCENT_COLOR;
}
