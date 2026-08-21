import { describe, expect, it } from "vitest";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { resolveRequesterStoreKey } from "./subagents/announce/subagent-requester-store-key.js";

describe("resolveRequesterStoreKey", () => {
  it("scopes a custom main alias to the persisted fixed-store owner", () => {
    const cfg = {
      agents: {
        ownership: "explicit",
        defaults: { sessionStore: { agentId: "ops" } },
        entries: { ops: {}, research: {} },
      },
      session: { mainKey: "work", store: "/tmp/mangabaclaw-shared-sessions.sqlite" },
    } satisfies MangabaClawConfig;

    expect(resolveRequesterStoreKey(cfg, "work")).toBe("agent:ops:work");
  });

  it("scopes a bare key to the explicit requester owner in an ownerless fleet", () => {
    const cfg = {
      agents: {
        ownership: "explicit",
        entries: { ops: {}, research: {} },
      },
    } satisfies MangabaClawConfig;

    expect(resolveRequesterStoreKey(cfg, "incident-42", "research")).toBe(
      "agent:research:incident-42",
    );
  });
});
