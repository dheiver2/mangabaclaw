// Covers skills entry config parsing and defaults.
import { describe, expect, it } from "vitest";
import { MangabaClawSchema } from "./zod-schema.js";

describe("skills entries config schema", () => {
  it("accepts custom fields under config", () => {
    const res = MangabaClawSchema.safeParse({
      skills: {
        entries: {
          "custom-skill": {
            enabled: true,
            config: {
              url: "https://example.invalid",
              token: "abc123",
            },
          },
        },
      },
    });

    expect(res.success).toBe(true);
  });

  it("rejects unknown top-level fields", () => {
    const res = MangabaClawSchema.safeParse({
      skills: {
        entries: {
          "custom-skill": {
            url: "https://example.invalid",
          },
        },
      },
    });

    expect(res.success).toBe(false);
    if (res.success) {
      return;
    }

    expect(
      res.error.issues.some(
        (issue) =>
          issue.path.join(".") === "skills.entries.custom-skill" &&
          issue.message.toLowerCase().includes("unrecognized"),
      ),
    ).toBe(true);
  });

  it("accepts agents.defaults.skills", () => {
    const res = MangabaClawSchema.safeParse({
      agents: {
        defaults: {
          skills: ["github", "weather"],
        },
        entries: { main: { default: true } },
      },
    });

    expect(res.success).toBe(true);
  });

  it("accepts agents.entries.*.skills as explicit replacements", () => {
    const res = MangabaClawSchema.safeParse({
      agents: {
        defaults: {
          skills: ["github", "weather"],
        },
        entries: { writer: { default: true, skills: ["docs-search"] } },
      },
    });

    expect(res.success).toBe(true);
  });

  it("accepts explicit empty skills arrays for defaults and agents", () => {
    const res = MangabaClawSchema.safeParse({
      agents: {
        defaults: {
          skills: [],
        },
        entries: { writer: { default: true, skills: [] } },
      },
    });

    expect(res.success).toBe(true);
  });

  it("accepts uploaded skill archive install policy", () => {
    const res = MangabaClawSchema.safeParse({
      skills: {
        install: {
          allowUploadedArchives: true,
        },
      },
    });

    expect(res.success).toBe(true);
  });

  it("rejects legacy skills.policy config", () => {
    const res = MangabaClawSchema.safeParse({
      skills: {
        policy: {
          globalEnabled: ["github"],
        } as never,
      },
    });

    expect(res.success).toBe(false);
    if (res.success) {
      return;
    }

    expect(
      res.error.issues.some(
        (issue) =>
          issue.path.join(".") === "skills" && issue.message.toLowerCase().includes("unrecognized"),
      ),
    ).toBe(true);
  });
});
