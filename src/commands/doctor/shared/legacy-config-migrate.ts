// Validating legacy config migration wrapper used by doctor config flow.
import type { LegacyConfigMigrationContext } from "../../../config/legacy.shared.js";
import type { MangabaClawConfig } from "../../../config/types.js";
import { validateConfigObjectWithPlugins } from "../../../config/validation.js";
import { applyLegacyDoctorMigrations } from "./legacy-config-compat.js";

/** Apply legacy migrations and validate the resulting MangabaClaw config shape when possible. */
export function migrateLegacyConfig(
  raw: unknown,
  context?: LegacyConfigMigrationContext,
): {
  config: MangabaClawConfig | null;
  sourceConfig?: MangabaClawConfig;
  changes: string[];
  partiallyValid?: boolean;
} {
  const { next, changes } = applyLegacyDoctorMigrations(raw, context);
  if (!next) {
    return { config: null, changes: [] };
  }
  const resolvedCandidate = context
    ? (applyLegacyDoctorMigrations(context.resolvedRaw, context).next ?? context.resolvedRaw)
    : next;
  const validated = validateConfigObjectWithPlugins(resolvedCandidate);
  if (!validated.ok) {
    changes.push("Migration applied; other validation issues remain — run doctor to review.");
    return { config: next as MangabaClawConfig, changes, partiallyValid: true };
  }
  return { config: validated.config, sourceConfig: next as MangabaClawConfig, changes };
}
