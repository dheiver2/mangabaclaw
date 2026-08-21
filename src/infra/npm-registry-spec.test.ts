// Tests npm registry spec parsing for packages, tags, and versions.
import { describe, expect, it } from "vitest";
import {
  compareMangabaClawReleaseVersions,
  formatPrereleaseResolutionError,
  isExactSemverVersion,
  isMangabaClawOrgNpmSpec,
  isPrereleaseSemverVersion,
  isPrereleaseResolutionAllowed,
  parseRegistryNpmSpec,
  resolveNpmJsonEntries,
  validateRegistryNpmSpec,
} from "./npm-registry-spec.js";

function parseSpecOrThrow(spec: string) {
  const parsed = parseRegistryNpmSpec(spec);
  if (parsed === null) {
    throw new Error(`Expected ${spec} to parse`);
  }
  return parsed;
}

describe("npm registry spec validation", () => {
  it.each([
    "@mangabaclaw/voice-call",
    "@mangabaclaw/voice-call@1.2.3",
    "@mangabaclaw/voice-call@1.2.3-beta.4",
    "@mangabaclaw/voice-call@latest",
    "@mangabaclaw/voice-call@beta",
  ])("accepts %s", (spec) => {
    expect(validateRegistryNpmSpec(spec)).toBeNull();
  });

  it.each([
    {
      spec: "@mangabaclaw/voice-call@^1.2.3",
      expected: "exact version or dist-tag",
    },
    {
      spec: "@mangabaclaw/voice-call@~1.2.3",
      expected: "exact version or dist-tag",
    },
    {
      spec: "https://npmjs.org/pkg.tgz",
      expected: "URLs are not allowed",
    },
    {
      spec: "git+ssh://github.com/mangabaclaw/mangabaclaw",
      expected: "URLs are not allowed",
    },
    {
      spec: "@mangabaclaw/voice-call@",
      expected: "missing version/tag after @",
    },
    {
      spec: "@mangabaclaw/voice-call@../beta",
      expected: "invalid version/tag",
    },
  ])("rejects %s", ({ spec, expected }) => {
    expect(validateRegistryNpmSpec(spec)).toContain(expected);
  });
});

describe("npm registry spec parsing helpers", () => {
  it.each([
    {
      spec: "@mangabaclaw/voice-call",
      expected: {
        name: "@mangabaclaw/voice-call",
        raw: "@mangabaclaw/voice-call",
        selectorKind: "none",
        selectorIsPrerelease: false,
      },
    },
    {
      spec: "@mangabaclaw/voice-call@beta",
      expected: {
        name: "@mangabaclaw/voice-call",
        raw: "@mangabaclaw/voice-call@beta",
        selector: "beta",
        selectorKind: "tag",
        selectorIsPrerelease: false,
      },
    },
    {
      spec: "@mangabaclaw/voice-call@2026.5.3-1",
      expected: {
        name: "@mangabaclaw/voice-call",
        raw: "@mangabaclaw/voice-call@2026.5.3-1",
        selector: "2026.5.3-1",
        selectorKind: "exact-version",
        selectorIsPrerelease: false,
      },
    },
    {
      spec: "@mangabaclaw/voice-call@1.2.3-beta.1",
      expected: {
        name: "@mangabaclaw/voice-call",
        raw: "@mangabaclaw/voice-call@1.2.3-beta.1",
        selector: "1.2.3-beta.1",
        selectorKind: "exact-version",
        selectorIsPrerelease: true,
      },
    },
  ])("parses %s", ({ spec, expected }) => {
    expect(parseRegistryNpmSpec(spec)).toEqual(expected);
  });

  it.each([
    { spec: "@mangabaclaw/voice-call", expected: true },
    { spec: "@mangabaclaw/voice-call@1.2.3", expected: true },
    { spec: "@other/voice-call", expected: false },
    { spec: "voice-call", expected: false },
    { spec: "npm:@mangabaclaw/voice-call", expected: false },
    { spec: undefined, expected: false },
  ])("detects MangabaClaw-org npm specs for %s", ({ spec, expected }) => {
    expect(isMangabaClawOrgNpmSpec(spec)).toBe(expected);
  });

  it.each([
    { value: "v1.2.3", expected: true },
    { value: "1.2", expected: false },
  ])("detects exact semver versions for %s", ({ value, expected }) => {
    expect(isExactSemverVersion(value)).toBe(expected);
  });

  it.each([
    { value: "1.2.3-beta.1", expected: true },
    { value: "1.2.3-1", expected: true },
    { value: "2026.5.3-beta.1", expected: true },
    { value: "2026.5.3-1", expected: false },
    { value: "2026.2.30-1", expected: false },
    { value: "1.2.3", expected: false },
  ])("detects prerelease semver versions for %s", ({ value, expected }) => {
    expect(isPrereleaseSemverVersion(value)).toBe(expected);
  });

  it.each([
    { left: "2026.5.3-1", right: "2026.5.3", expected: 1 },
    { left: "2026.5.3-2", right: "2026.5.3-1", expected: 1 },
    { left: "2026.5.3", right: "2026.5.3-beta.3", expected: 1 },
    { left: "2026.5.3-beta.3", right: "2026.5.3-alpha.9", expected: 1 },
    { left: "2026.5.3-alpha.10", right: "2026.5.3-alpha.2", expected: 1 },
    { left: "2026.5.3-0", right: "2026.5.3", expected: null },
    { left: "2026.5.3+build", right: "2026.5.3", expected: null },
    { left: "1.2.3-1", right: "1.2.3", expected: null },
  ])("compares MangabaClaw release versions for %s and %s", ({ left, right, expected }) => {
    expect(compareMangabaClawReleaseVersions(left, right)).toBe(expected);
  });
});

describe("npm prerelease resolution policy", () => {
  it.each([
    {
      spec: "@mangabaclaw/voice-call",
      resolvedVersion: "1.2.3-beta.1",
      expected: false,
    },
    {
      spec: "@mangabaclaw/voice-call@latest",
      resolvedVersion: "1.2.3-rc.1",
      expected: false,
    },
    {
      spec: "@mangabaclaw/voice-call@latest",
      resolvedVersion: "2026.5.3-1",
      expected: true,
    },
    {
      spec: "@mangabaclaw/voice-call@beta",
      resolvedVersion: "1.2.3-beta.4",
      expected: true,
    },
    {
      spec: "@mangabaclaw/voice-call@1.2.3-beta.1",
      resolvedVersion: "1.2.3-beta.1",
      expected: true,
    },
    {
      spec: "@mangabaclaw/voice-call",
      resolvedVersion: "1.2.3",
      expected: true,
    },
    {
      spec: "@mangabaclaw/voice-call@latest",
      resolvedVersion: undefined,
      expected: true,
    },
  ])("decides prerelease resolution for %s -> %s", ({ spec, resolvedVersion, expected }) => {
    expect(
      isPrereleaseResolutionAllowed({
        spec: parseSpecOrThrow(spec),
        resolvedVersion,
      }),
    ).toBe(expected);
  });

  it.each([
    {
      spec: "@mangabaclaw/voice-call",
      resolvedVersion: "1.2.3-beta.1",
      expected: `Use "@mangabaclaw/voice-call@beta"`,
    },
    {
      spec: "@mangabaclaw/voice-call@beta",
      resolvedVersion: "1.2.3-rc.1",
      expected: "Use an explicit prerelease tag or exact prerelease version",
    },
  ])("formats prerelease guidance for %s", ({ spec, resolvedVersion, expected }) => {
    expect(
      formatPrereleaseResolutionError({
        spec: parseSpecOrThrow(spec),
        resolvedVersion,
      }),
    ).toContain(expected);
  });
});

describe("resolveNpmJsonEntries", () => {
  it("passes entry arrays through (npm <=11 pack shape)", () => {
    const entries = [{ name: "mangabaclaw", version: "2026.7.1", filename: "mangabaclaw-2026.7.1.tgz" }];
    expect(resolveNpmJsonEntries(entries)).toBe(entries);
  });

  it("keeps a bare entry object as a single entry (npm <=11 view shape)", () => {
    const entry = { name: "mangabaclaw", version: "2026.7.1", "dist.integrity": "sha512-x" };
    expect(resolveNpmJsonEntries(entry)).toEqual([entry]);
  });

  it("unwraps the npm 12 singleton view array", () => {
    const entry = { name: "mangabaclaw", version: "2026.7.1", "dist.integrity": "sha512-x" };
    expect(resolveNpmJsonEntries([entry])).toEqual([entry]);
  });

  it("unwraps the npm 12 name-keyed pack object", () => {
    const entry = {
      id: "mangabaclaw@2026.7.1",
      name: "mangabaclaw",
      version: "2026.7.1",
      filename: "mangabaclaw-2026.7.1.tgz",
    };
    expect(resolveNpmJsonEntries({ mangabaclaw: entry })).toEqual([entry]);
  });

  it("unwraps scoped name keys in the npm 12 pack object", () => {
    const entry = { id: "@mangabaclaw/voice-call@1.2.3", name: "@mangabaclaw/voice-call" };
    expect(resolveNpmJsonEntries({ "@mangabaclaw/voice-call": entry })).toEqual([entry]);
  });

  it("falls back to the raw value when no entries are recognizable", () => {
    expect(resolveNpmJsonEntries("not-json-shaped")).toEqual(["not-json-shaped"]);
    expect(resolveNpmJsonEntries(null)).toEqual([null]);
  });
});
