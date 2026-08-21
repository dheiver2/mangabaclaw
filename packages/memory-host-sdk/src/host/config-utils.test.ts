import { describe, expect, it } from "vitest";
import {
  normalizeConfiguredMemoryExtraPaths,
  resolveMemoryHostAgentWorkspaceDir,
  resolveRememberAcrossConversations,
} from "./config-utils.js";

describe("resolveMemoryHostAgentWorkspaceDir", () => {
  it("uses the active profile state root for the default agent workspace", () => {
    expect(
      resolveMemoryHostAgentWorkspaceDir({}, "main", {
        HOME: "/home/peter",
        MANGABACLAW_PROFILE: "work",
        MANGABACLAW_STATE_DIR: "/home/peter/.mangabaclaw-work",
      }),
    ).toBe("/home/peter/.mangabaclaw-work/workspace");
  });

  it("keeps the default agent workspace inside an overridden state directory", () => {
    expect(
      resolveMemoryHostAgentWorkspaceDir({}, "main", {
        HOME: "/home/peter",
        MANGABACLAW_STATE_DIR: "/srv/mangabaclaw-scratch",
      }),
    ).toBe("/srv/mangabaclaw-scratch/workspace");
  });

  it("prefers an explicit workspace override to the state directory", () => {
    expect(
      resolveMemoryHostAgentWorkspaceDir({}, "main", {
        HOME: "/home/peter",
        MANGABACLAW_STATE_DIR: "/srv/mangabaclaw-scratch",
        MANGABACLAW_WORKSPACE_DIR: "/srv/mangabaclaw-workspace",
      }),
    ).toBe("/srv/mangabaclaw-workspace");
  });
});

describe("resolveRememberAcrossConversations", () => {
  it("honors keyed per-agent memory overrides", () => {
    const config = {
      memory: { search: { rememberAcrossConversations: true } },
      agents: {
        entries: {
          support: { memory: { search: { rememberAcrossConversations: false } } },
        },
      },
    };

    expect(resolveRememberAcrossConversations(config, "support")).toBe(false);
  });
});

describe("normalizeConfiguredMemoryExtraPaths", () => {
  it("preserves distinct patterns and canonicalizes unpatterned objects", () => {
    expect(
      normalizeConfiguredMemoryExtraPaths([
        " notes ",
        { path: "notes" },
        { path: " notes ", pattern: " runbooks/**/*.md " },
        { path: "notes", pattern: "runbooks/**/*.md" },
        { path: "notes", pattern: "decisions/**/*.md" },
      ]),
    ).toEqual([
      "notes",
      { path: "notes", pattern: "runbooks/**/*.md" },
      { path: "notes", pattern: "decisions/**/*.md" },
    ]);
  });
});
