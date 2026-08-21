import { describe, expect, it } from "vitest";
import { MangabaClawSchema } from "./zod-schema.js";

describe("logging.audit.executionIdentity", () => {
  it("accepts only the explicit boolean config surface", () => {
    expect(
      MangabaClawSchema.safeParse({
        logging: { audit: { executionIdentity: true } },
      }).success,
    ).toBe(true);
    expect(
      MangabaClawSchema.safeParse({
        logging: { audit: { executionIdentity: false } },
      }).success,
    ).toBe(true);
    expect(
      MangabaClawSchema.safeParse({
        logging: { audit: { executionIdentity: "true" } },
      }).success,
    ).toBe(false);
    expect(
      MangabaClawSchema.safeParse({
        logging: { audit: { execution_identity: true } },
      }).success,
    ).toBe(false);
  });
});
