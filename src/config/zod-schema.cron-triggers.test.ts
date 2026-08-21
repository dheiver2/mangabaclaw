import { describe, expect, it } from "vitest";
import { MangabaClawSchema } from "./zod-schema.js";

describe("MangabaClawSchema cron triggers", () => {
  it("accepts the strict trigger gate", () => {
    expect(MangabaClawSchema.parse({ cron: { triggers: { enabled: true } } }).cron?.triggers).toEqual({
      enabled: true,
    });
  });

  it("rejects invalid and unknown trigger settings", () => {
    expect(
      MangabaClawSchema.safeParse({ cron: { triggers: { enabled: true, extra: true } } }).success,
    ).toBe(false);
  });
});
