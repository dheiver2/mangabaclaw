import { describe, expect, it } from "vitest";
import { projectCloneInput, resolveProjectChip } from "./project-chip.ts";

const projects = [
  {
    id: "mangabaclaw",
    displayName: "MangabaClaw",
    repoRoot: "/workspace/mangabaclaw",
    source: "registered" as const,
  },
  {
    id: "website",
    displayName: "Website",
    repoRoot: "/workspace/site",
    source: "workspace" as const,
  },
];

describe("What chip state", () => {
  it.each([
    {
      name: "filters registered and workspace projects locally",
      query: "site",
      expectedProjects: ["website"],
      expectedRecents: 0,
      showWorkspace: false,
    },
  ])("$name", ({ query, expectedProjects, expectedRecents, showWorkspace }) => {
    const state = resolveProjectChip({
      folder: "",
      workspace: "/workspace",
      projectId: "",
      selectedRemoteProject: null,
      projects,
      recents: [],
      projectQuery: query,
    });
    expect(state.localProjects.map((project) => project.id)).toEqual(expectedProjects);
    expect(state.recents).toHaveLength(expectedRecents);
    expect(state.showWorkspace).toBe(showWorkspace);
  });

  it("omits project recents already shown in the project list", () => {
    const folderRecent = {
      kind: "folder" as const,
      folder: "/workspace/scratch",
      displayName: "scratch",
    };
    const state = resolveProjectChip({
      folder: "",
      workspace: "/workspace",
      projectId: "",
      selectedRemoteProject: null,
      projects,
      recents: [{ kind: "project", projectId: "mangabaclaw", displayName: "MangabaClaw" }, folderRecent],
      projectQuery: "",
    });

    expect(state.recents).toEqual([folderRecent]);
  });

  it.each([
    ["https://github.com/mangabaclaw/mangabaclaw.git", true],
    ["git@github.com:mangabaclaw/mangabaclaw.git", true],
    ["file:///tmp/mangabaclaw.git", false],
    ["--upload-pack=touch-pwned", false],
    ["https://github.com/mangabaclaw/mangabaclaw.git --config=evil", false],
  ])("recognizes safe clone input %s", (value, expected) => {
    expect(projectCloneInput(value) !== null).toBe(expected);
  });
});
