// Entry metadata tests cover display metadata resolution for agents and jobs.
import { describe, expect, it } from "vitest";
import { resolveEmojiAndHomepage } from "./entry-metadata.js";

describe("shared/entry-metadata", () => {
  it("prefers metadata emoji and homepage when present", () => {
    expect(
      resolveEmojiAndHomepage({
        metadata: { emoji: "🥭", homepage: " https://mangaba.ia.br " },
        frontmatter: { emoji: "🙂", homepage: "https://example.com" },
      }),
    ).toEqual({
      emoji: "🥭",
      homepage: "https://mangaba.ia.br",
    });
  });

  it("keeps metadata precedence even when metadata values are blank", () => {
    expect(
      resolveEmojiAndHomepage({
        metadata: { emoji: "", homepage: "   " },
        frontmatter: { emoji: "🙂", homepage: "https://example.com" },
      }),
    ).toStrictEqual({});
  });

  it("falls back through frontmatter homepage aliases and drops blanks", () => {
    expect(
      resolveEmojiAndHomepage({
        frontmatter: { emoji: "🙂", website: " https://docs.openclaw.ai " },
      }),
    ).toEqual({
      emoji: "🙂",
      homepage: "https://docs.openclaw.ai",
    });
    expect(
      resolveEmojiAndHomepage({
        metadata: { homepage: "   " },
        frontmatter: { url: "   " },
      }),
    ).toStrictEqual({});
    expect(
      resolveEmojiAndHomepage({
        frontmatter: { url: " https://mangaba.ia.br/install " },
      }),
    ).toEqual({
      homepage: "https://mangaba.ia.br/install",
    });
  });

  it("does not fall back once frontmatter homepage aliases are present but blank", () => {
    expect(
      resolveEmojiAndHomepage({
        frontmatter: {
          homepage: " ",
          website: "https://docs.openclaw.ai",
          url: "https://mangaba.ia.br/install",
        },
      }),
    ).toStrictEqual({});
  });
});
