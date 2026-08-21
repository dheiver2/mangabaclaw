// Workspace default tests cover environment-variable precedence for the
// built-in agent workspace location.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withEnv } from "../test-utils/env.js";
import { resolveDefaultAgentWorkspaceDir } from "./workspace.js";

describe("DEFAULT_AGENT_WORKSPACE_DIR", () => {
  it("uses MANGABACLAW_HOME when resolving the default workspace dir", () => {
    const home = path.join(path.sep, "srv", "mangabaclaw-home");

    const resolved = withEnv(
      {
        MANGABACLAW_WORKSPACE_DIR: undefined,
        MANGABACLAW_PROFILE: undefined,
        MANGABACLAW_HOME: home,
        HOME: path.join(path.sep, "home", "other"),
      },
      () => resolveDefaultAgentWorkspaceDir(),
    );

    expect(resolved).toBe(path.join(path.resolve(home), ".mangabaclaw", "workspace"));
  });

  it("uses MANGABACLAW_WORKSPACE_DIR before MANGABACLAW_HOME", () => {
    const workspaceDir = path.join(path.sep, "srv", "mangabaclaw-workspace");

    const resolved = withEnv(
      {
        MANGABACLAW_WORKSPACE_DIR: workspaceDir,
        MANGABACLAW_HOME: path.join(path.sep, "srv", "mangabaclaw-home"),
      },
      () => resolveDefaultAgentWorkspaceDir(),
    );

    expect(resolved).toBe(path.resolve(workspaceDir));
  });
});
