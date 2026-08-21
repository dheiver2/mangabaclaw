/**
 * Auth profile id and display metadata helpers.
 * Keeps profile id construction and human metadata lookup centralized for auth
 * status, storage, and provider selection.
 */
import { normalizeOptionalString } from "@mangabaclaw/normalization-core/string-coerce";
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import type { AuthProfileStore } from "./types.js";

// Metadata can be configured separately from stored credentials. Config wins so
// display labels can be edited without mutating secrets.
function resolveStoredMetadata(store: AuthProfileStore | undefined, profileId: string) {
  const profile = store?.profiles[profileId];
  if (!profile) {
    return {};
  }
  return {
    displayName:
      "displayName" in profile ? normalizeOptionalString(profile.displayName) : undefined,
    email: "email" in profile ? normalizeOptionalString(profile.email) : undefined,
  };
}

/** Builds a provider-prefixed auth profile id. */
export function buildAuthProfileId(params: {
  providerId: string;
  profileName?: string | null;
  profilePrefix?: string;
}): string {
  const profilePrefix = normalizeOptionalString(params.profilePrefix) ?? params.providerId;
  const profileName = normalizeOptionalString(params.profileName) ?? "default";
  return `${profilePrefix}:${profileName}`;
}

/** Resolves display metadata for an auth profile from config/store. */
export function resolveAuthProfileMetadata(params: {
  cfg?: MangabaClawConfig;
  store?: AuthProfileStore;
  profileId: string;
}): { displayName?: string; email?: string } {
  const configured = params.cfg?.auth?.profiles?.[params.profileId];
  const stored = resolveStoredMetadata(params.store, params.profileId);
  return {
    displayName: normalizeOptionalString(configured?.displayName) ?? stored.displayName,
    email: normalizeOptionalString(configured?.email) ?? stored.email,
  };
}
