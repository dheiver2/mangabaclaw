import { describe, expect, it } from "vitest";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { AgentSelectionRequiredError } from "./agent-scope.js";
import { resolveModelWorkspaceDir } from "./model-discovery-context.js";

function multiAgentConfig(): MangabaClawConfig {
  return {
    agents: {
      entries: {
        alpha: { workspace: "/workspaces/alpha" },
        beta: { workspace: "/workspaces/beta" },
      },
    },
  } as MangabaClawConfig;
}

describe("resolveModelWorkspaceDir", () => {
  it("reuses an already-resolved agentId instead of re-deriving a default", () => {
    const cfg = multiAgentConfig();
    expect(resolveModelWorkspaceDir(cfg, undefined, "beta")).toBe("/workspaces/beta");
  });

  it("throws when no agentId is known and multiple agents are configured", () => {
    const cfg = multiAgentConfig();
    expect(() => resolveModelWorkspaceDir(cfg, undefined)).toThrow(AgentSelectionRequiredError);
  });

  it("prefers an explicit workspace dir over agent resolution", () => {
    const cfg = multiAgentConfig();
    expect(resolveModelWorkspaceDir(cfg, "/explicit/dir", "beta")).toBe("/explicit/dir");
  });
});
