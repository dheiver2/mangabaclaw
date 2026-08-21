// Tests package tag parsing and stable release tag behavior.
import { describe, expect, it } from "vitest";
import { normalizePackageTagInput } from "./package-tag.js";

describe("normalizePackageTagInput", () => {
  const packageNames = ["mangabaclaw", "@mangabaclaw/plugin"] as const;

  it.each([
    { input: undefined, expected: null },
    { input: "   ", expected: null },
    { input: "mangabaclaw@beta", expected: "beta" },
    { input: "@mangabaclaw/plugin@2026.2.24", expected: "2026.2.24" },
    { input: "mangabaclaw@   ", expected: null },
    { input: "mangabaclaw", expected: null },
    { input: " @mangabaclaw/plugin ", expected: null },
    { input: " latest ", expected: "latest" },
    { input: "@other/plugin@beta", expected: "@other/plugin@beta" },
    { input: "mangabaclawer@beta", expected: "mangabaclawer@beta" },
  ] satisfies ReadonlyArray<{ input: string | undefined; expected: string | null }>)(
    "normalizes %j",
    ({ input, expected }) => {
      expect(normalizePackageTagInput(input, packageNames)).toBe(expected);
    },
  );
});
