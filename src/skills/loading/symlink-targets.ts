// Shared helpers for config-trusted skill symlink targets.
import path from "node:path";
import { normalizeOptionalString } from "@mangabaclaw/normalization-core/string-coerce";
import { uniqueStrings } from "@mangabaclaw/normalization-core/string-normalization";
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import { safeRealpathSync } from "../../infra/boundary-path.js";
import { isPathInside } from "../../infra/path-guards.js";
import { resolveUserPath } from "../../utils.js";

export function resolveAllowedSkillSymlinkTargetRealPaths(config?: MangabaClawConfig): string[] {
  const rawTargets = config?.skills?.load?.allowSymlinkTargets ?? [];
  const targetPaths = rawTargets
    .map((dir) => normalizeOptionalString(dir) ?? "")
    .filter(Boolean)
    .map((dir) => safeRealpathSync(resolveUserPath(dir)))
    .filter((dir): dir is string => Boolean(dir));
  return uniqueStrings(targetPaths);
}

export function findContainingAllowedSkillSymlinkTarget(
  rootRealPaths: readonly string[],
  candidateRealPath: string,
): string | null {
  const resolvedCandidate = path.resolve(candidateRealPath);
  for (const rootRealPath of rootRealPaths) {
    const resolvedRoot = path.resolve(rootRealPath);
    if (isPathInside(resolvedRoot, resolvedCandidate)) {
      return resolvedRoot;
    }
  }
  return null;
}

export const tryRealpath = safeRealpathSync;
