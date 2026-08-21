import crypto from "node:crypto";
import { stableStringify } from "@mangabaclaw/normalization-core";
import { redactConfigObject } from "../../config/redact-snapshot.js";
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";

let configFingerprints = new WeakMap<MangabaClawConfig, string>();

export function fingerprintSkillSnapshotConfig(config: MangabaClawConfig): string {
  const cached = configFingerprints.get(config);
  if (cached) {
    return cached;
  }
  const fingerprint = crypto
    .createHash("sha256")
    .update(stableStringify(redactConfigObject(config)))
    .digest("hex");
  configFingerprints.set(config, fingerprint);
  return fingerprint;
}

export function resetSkillSnapshotConfigFingerprintCache(): void {
  configFingerprints = new WeakMap();
}
