import type { ChannelDoctorConfigMutation } from "mangabaclaw/plugin-sdk/channel-contract";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { asObjectRecord } from "mangabaclaw/plugin-sdk/runtime-doctor-migrations";

function stripTimeoutSeconds(value: unknown): { value: unknown; changed: boolean } {
  const record = asObjectRecord(value);
  if (!record) {
    return { value, changed: false };
  }
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key === "timeoutSeconds") {
      changed = true;
      continue;
    }
    const stripped = stripTimeoutSeconds(child);
    changed = changed || stripped.changed;
    next[key] = stripped.value;
  }
  return { value: changed ? next : value, changed };
}

export function normalizeCompatibilityConfig({
  cfg,
}: {
  cfg: MangabaClawConfig;
}): ChannelDoctorConfigMutation {
  const rawEntry = asObjectRecord(
    (cfg.channels as Record<string, unknown> | undefined)?.clickclack,
  );
  if (!rawEntry) {
    return { config: cfg, changes: [] };
  }
  const stripped = stripTimeoutSeconds(rawEntry);
  if (!stripped.changed) {
    return { config: cfg, changes: [] };
  }
  return {
    config: {
      ...cfg,
      channels: {
        ...cfg.channels,
        clickclack: stripped.value,
      } as MangabaClawConfig["channels"],
    },
    changes: ["Removed retired ClickClack timeout tuning knobs."],
  };
}
