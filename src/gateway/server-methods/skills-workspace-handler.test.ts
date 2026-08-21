import { describe, expect, it } from "vitest";
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import { resolveSkillsAgentWorkspace } from "./skills-workspace-handler.js";
import type { GatewayRequestContext } from "./types.js";

function context(config: MangabaClawConfig): GatewayRequestContext {
  return { getRuntimeConfig: () => config } as GatewayRequestContext;
}

describe("resolveSkillsAgentWorkspace", () => {
  const config: MangabaClawConfig = {
    agents: {
      ownership: "explicit",
      list: [{ id: "ops" }, { id: "research" }],
    },
  };

  it("returns typed selection-required when an explicit fleet omits agentId", () => {
    const result = resolveSkillsAgentWorkspace({}, context(config));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", message: expect.stringContaining("agent") },
    });
  });

  it("uses the explicitly selected agent workspace", () => {
    const result = resolveSkillsAgentWorkspace({ agentId: "research" }, context(config));

    expect(result).toMatchObject({ ok: true, agentId: "research" });
  });
});
