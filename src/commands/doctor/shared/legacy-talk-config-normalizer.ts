// Legacy Talk config normalizer for provider scalar fields and realtime aliases.
import { isDeepStrictEqual } from "node:util";
import { isRecord } from "@mangabaclaw/normalization-core/record-coerce";
import { normalizeTalkSection } from "../../../config/talk.js";
import type { MangabaClawConfig } from "../../../config/types.js";

function buildLegacyTalkProviderCompat(
  talk: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const compat: Record<string, unknown> = {};
  for (const key of ["voiceId", "voiceAliases", "modelId", "outputFormat", "apiKey"] as const) {
    if (talk[key] !== undefined) {
      compat[key] = talk[key];
    }
  }
  return Object.keys(compat).length > 0 ? compat : undefined;
}

function buildLegacyRealtimeTalkCompat(
  talk: Record<string, unknown>,
  normalizedTalk: NonNullable<MangabaClawConfig["talk"]>,
): Record<string, unknown> | undefined {
  if (talk.realtime !== undefined) {
    return undefined;
  }
  const compat: Record<string, unknown> = {};
  for (const key of ["model", "mode", "transport", "brain"] as const) {
    if (talk[key] !== undefined) {
      compat[key] = talk[key];
    }
  }
  if (talk.voice !== undefined) {
    compat.speakerVoice = talk.voice;
  }
  if (Object.keys(compat).length === 0) {
    return undefined;
  }
  if (normalizedTalk.provider !== undefined) {
    compat.provider = normalizedTalk.provider;
  }
  if (normalizedTalk.providers !== undefined) {
    compat.providers = normalizedTalk.providers;
  }
  return normalizeTalkSection({ realtime: compat } as MangabaClawConfig["talk"])?.realtime;
}

/** Normalize legacy Talk provider/realtime fields into current talk.providers and talk.realtime. */
export function normalizeLegacyTalkConfig(cfg: MangabaClawConfig, changes: string[]): MangabaClawConfig {
  const rawTalk = cfg.talk;
  if (!isRecord(rawTalk)) {
    return cfg;
  }

  const normalizedTalk = normalizeTalkSection(rawTalk as MangabaClawConfig["talk"]) ?? {};
  const legacyProviderCompat = buildLegacyTalkProviderCompat(rawTalk);
  if (legacyProviderCompat) {
    normalizedTalk.providers = {
      ...normalizedTalk.providers,
      elevenlabs: {
        ...legacyProviderCompat,
        ...normalizedTalk.providers?.elevenlabs,
      },
    };
  }
  const legacyRealtimeCompat = buildLegacyRealtimeTalkCompat(rawTalk, normalizedTalk);
  if (legacyRealtimeCompat) {
    normalizedTalk.realtime = {
      ...legacyRealtimeCompat,
      ...normalizedTalk.realtime,
    };
  }
  if (Object.keys(normalizedTalk).length === 0 || isDeepStrictEqual(normalizedTalk, rawTalk)) {
    return cfg;
  }

  changes.push(
    "Normalized talk.provider/providers shape (trimmed provider ids and merged missing compatibility fields).",
  );
  if (legacyRealtimeCompat) {
    changes.push("Moved legacy realtime Talk provider/model fields into talk.realtime.");
  }
  return {
    ...cfg,
    talk: normalizedTalk,
  };
}
