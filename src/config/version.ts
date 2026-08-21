// Normalizes config version metadata and compatibility comparisons.
import { parse as parseSemver, type SemVer } from "semver";
import {
  compareMangabaClawSemver,
  isMangabaClawCorrectionSemver,
  normalizeLegacyDotBetaVersion,
} from "../infra/semver.js";

/** Parses stable, prerelease, and legacy dot-beta MangabaClaw versions. */
function parseMangabaClawVersion(raw: string | null | undefined): SemVer | null {
  if (!raw) {
    return null;
  }
  const normalized = normalizeLegacyDotBetaVersion(raw.trim());
  return parseSemver(normalized);
}

export function normalizeMangabaClawVersionBase(raw: string | null | undefined): string | null {
  const parsed = parseMangabaClawVersion(raw);
  if (!parsed) {
    return null;
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

export function compareMangabaClawVersions(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const parsedA = parseMangabaClawVersion(a);
  const parsedB = parseMangabaClawVersion(b);
  if (!parsedA || !parsedB) {
    return null;
  }
  return compareMangabaClawSemver(parsedA, parsedB);
}

export function shouldWarnOnTouchedVersion(
  current: string | null | undefined,
  touched: string | null | undefined,
): boolean {
  const parsedCurrent = parseMangabaClawVersion(current);
  const parsedTouched = parseMangabaClawVersion(touched);
  if (parsedCurrent && parsedTouched && parsedCurrent.compareMain(parsedTouched) === 0) {
    if (parsedTouched.prerelease.length === 0 || isMangabaClawCorrectionSemver(parsedTouched)) {
      return false;
    }
  }
  return parsedCurrent !== null && parsedTouched !== null
    ? compareMangabaClawSemver(parsedCurrent, parsedTouched) < 0
    : false;
}
