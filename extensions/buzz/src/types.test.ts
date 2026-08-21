import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { describe, expect, it } from "vitest";
import { listBuzzAccountIds } from "./types.js";

describe("listBuzzAccountIds", () => {
  it("discovers the default account from a configured private-key SecretRef", () => {
    const cfg = {
      channels: {
        buzz: {
          privateKey: { source: "file", provider: "vault", id: "/buzz/private-key" },
        },
      },
    } as MangabaClawConfig;

    expect(listBuzzAccountIds(cfg)).toEqual(["default"]);
  });
});
