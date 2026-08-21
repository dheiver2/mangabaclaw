// Log file path tests cover profile-aware rolling filename resolution.
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isLegacyRollingLogFilePath,
  isSameRollingLogFileFamily,
  resolveConfiguredLogFilePath,
  resolveRollingLogFilePathForDate,
} from "./log-file-path.js";

const date = new Date(2026, 6, 22, 12, 0, 0);

describe("resolveConfiguredLogFilePath", () => {
  it.each([
    { name: "unset", env: {}, expected: "mangabaclaw-2026-07-22.log" },
    {
      name: "explicit default",
      env: { MANGABACLAW_PROFILE: "Default" },
      expected: "mangabaclaw-2026-07-22.log",
    },
    {
      name: "named",
      env: { MANGABACLAW_PROFILE: "dev" },
      expected: "mangabaclaw-dev-2026-07-22.log",
    },
    {
      name: "sanitized",
      env: { MANGABACLAW_PROFILE: "QA_Profile" },
      expected: "mangabaclaw--1q-1a-0-1profile-2026-07-22.log",
    },
  ])("uses the $name profile filename", ({ env, expected }) => {
    const resolved = resolveConfiguredLogFilePath(undefined, { date, env });

    expect(path.basename(resolved)).toBe(expected);
  });

  it("keeps profiles distinct when sanitization would otherwise collide", () => {
    const underscored = resolveConfiguredLogFilePath(undefined, {
      date,
      env: { MANGABACLAW_PROFILE: "QA_Profile" },
    });
    const dashed = resolveConfiguredLogFilePath(undefined, {
      date,
      env: { MANGABACLAW_PROFILE: "qa-profile" },
    });

    expect(underscored).not.toBe(dashed);
    expect(path.basename(dashed)).toBe("mangabaclaw-qa--profile-2026-07-22.log");
  });

  it("keeps escaped output distinct from a profile that resembles the encoding", () => {
    const transformed = resolveConfiguredLogFilePath(undefined, {
      date,
      env: { MANGABACLAW_PROFILE: "QA_Profile" },
    });
    const lookalike = resolveConfiguredLogFilePath(undefined, {
      date,
      env: { MANGABACLAW_PROFILE: "-1q-1a-0-1profile" },
    });

    expect(transformed).not.toBe(lookalike);
  });

  it("bounds direct environment profiles that exceed the CLI length contract", () => {
    const first = resolveConfiguredLogFilePath(undefined, {
      date,
      env: { MANGABACLAW_PROFILE: "A".repeat(80) },
    });
    const second = resolveConfiguredLogFilePath(undefined, {
      date,
      env: { MANGABACLAW_PROFILE: "B".repeat(80) },
    });

    expect(path.basename(first)).toMatch(/^mangabaclaw--3[a-f0-9]{64}-2026-07-22\.log$/u);
    expect(path.basename(first).length).toBeLessThanOrEqual(255);
    expect(first).not.toBe(second);
  });

  it("preserves an explicit logging.file override", () => {
    expect(
      resolveConfiguredLogFilePath(
        { logging: { file: "/var/log/mangabaclaw/custom.log" } },
        { date, env: { MANGABACLAW_PROFILE: "dev" } },
      ),
    ).toBe("/var/log/mangabaclaw/custom.log");
  });
});

describe("profile rolling log families", () => {
  it("preserves the profile segment across date rollover", () => {
    expect(
      resolveRollingLogFilePathForDate(
        "/tmp/mangabaclaw/mangabaclaw-dev-2026-07-22.log",
        new Date(2026, 6, 23, 12, 0, 0),
      ),
    ).toBe("/tmp/mangabaclaw/mangabaclaw-dev-2026-07-23.log");
  });

  it("expands the legacy YYYY-MM-DD placeholder", () => {
    expect(
      resolveRollingLogFilePathForDate(
        "/tmp/mangabaclaw/mangabaclaw-YYYY-MM-DD.log",
        new Date(2026, 6, 23, 12, 0, 0),
      ),
    ).toBe("/tmp/mangabaclaw/mangabaclaw-2026-07-23.log");
  });

  it("keeps default and named profile fallback families separate", () => {
    expect(
      isSameRollingLogFileFamily("mangabaclaw-dev-2026-07-22.log", "mangabaclaw-dev-2026-07-21.log"),
    ).toBe(true);
    expect(
      isSameRollingLogFileFamily("mangabaclaw-dev-2026-07-22.log", "mangabaclaw-2026-07-22.log"),
    ).toBe(false);
  });

  it("keeps legacy explicit dated paths rolling without broadening the override contract", () => {
    expect(isLegacyRollingLogFilePath("mangabaclaw-2026-07-22.log")).toBe(true);
    expect(isLegacyRollingLogFilePath("mangabaclaw-YYYY-MM-DD.log")).toBe(true);
    expect(isLegacyRollingLogFilePath("mangabaclaw-dev-2026-07-22.log")).toBe(false);
  });
});
