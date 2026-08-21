import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  PROJECTS_LIST_DEFAULT_LIMIT,
  PROJECTS_LIST_MAX_CHECKOUTS_PER_PROJECT,
  ProjectRecordSchema,
  ProjectsAddResultSchema,
  ProjectSummarySchema,
  ProjectsListResultSchema,
  ProjectsSearchRemoteResultSchema,
  validateProjectsAddParams,
  validateProjectsListParams,
  validateProjectsRegisterParams,
  validateProjectsRemoveParams,
  validateProjectsSearchRemoteParams,
  validateSessionsCreateParams,
} from "../index.js";

describe("project protocol schemas", () => {
  it("validates project method inputs as closed objects", () => {
    expect(validateProjectsListParams({})).toBe(true);
    expect(validateProjectsListParams({ includeObserved: true })).toBe(true);
    expect(validateProjectsListParams({ includeObserved: false })).toBe(true);
    expect(validateProjectsListParams({ includeObserved: "yes" })).toBe(false);
    expect(validateProjectsListParams({ extra: true })).toBe(false);
    expect(validateProjectsRegisterParams({ path: "/repo", name: "MangabaClaw" })).toBe(true);
    expect(validateProjectsRegisterParams({ path: "" })).toBe(false);
    expect(validateProjectsAddParams({ gitUrl: "https://github.com/mangabaclaw/mangabaclaw.git" })).toBe(
      true,
    );
    expect(validateProjectsAddParams({ gitUrl: "", unexpected: true })).toBe(false);
    expect(validateProjectsSearchRemoteParams({ query: "mangabaclaw" })).toBe(true);
    expect(validateProjectsSearchRemoteParams({ query: "" })).toBe(false);
    expect(validateProjectsRemoveParams({ id: "mangabaclaw-2", deleteCheckout: true })).toBe(true);
    expect(validateProjectsRemoveParams({ id: "workspace:main" })).toBe(false);
  });

  it("accepts bounded remote search and clone results", () => {
    const project = {
      id: "mangabaclaw",
      displayName: "MangabaClaw",
      repoRoot: "/state/projects/fingerprint/mangabaclaw",
      originUrl: "https://github.com/mangabaclaw/mangabaclaw.git",
      source: "cloned",
    };
    expect(Value.Check(ProjectsAddResultSchema, project)).toBe(true);
    expect(
      Value.Check(ProjectsSearchRemoteResultSchema, {
        credential: "missing",
        projects: [
          {
            name: "mangabaclaw",
            fullName: "mangabaclaw/mangabaclaw",
            description: "Personal AI assistant",
            cloneUrl: "https://github.com/mangabaclaw/mangabaclaw.git",
            webUrl: "https://github.com/mangabaclaw/mangabaclaw",
            private: false,
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts workspace and stored project records", () => {
    expect(
      Value.Check(ProjectRecordSchema, {
        id: "workspace:main",
        displayName: "mangabaclaw",
        source: "workspace",
        agentId: "main",
      }),
    ).toBe(true);
    expect(
      Value.Check(ProjectsListResultSchema, {
        projects: [
          {
            id: "mangabaclaw",
            displayName: "MangabaClaw",
            repoRoot: "/repo/mangabaclaw",
            originUrl: "https://github.com/mangabaclaw/mangabaclaw.git",
            source: "registered",
          },
        ],
        recents: [
          { kind: "project", projectId: "mangabaclaw", displayName: "MangabaClaw" },
          { kind: "folder", folder: "/repo/scratch", displayName: "scratch" },
        ],
        observedProjects: [],
      }),
    ).toBe(true);
    expect(Value.Check(ProjectsListResultSchema, { projects: [] })).toBe(true);
    expect(Value.Check(ProjectsListResultSchema, { observedProjects: [] })).toBe(false);
  });

  it("bounds observed projects and their checkout lists", () => {
    const project = {
      name: "mangabaclaw",
      originUrl: "https://github.com/mangabaclaw/mangabaclaw.git",
      checkouts: [{ runnerId: "gateway", path: "/repo/mangabaclaw" }],
      lastUsedAt: 1,
    };
    expect(Value.Check(ProjectSummarySchema, project)).toBe(true);
    expect(
      Value.Check(ProjectSummarySchema, {
        ...project,
        checkouts: Array.from(
          { length: PROJECTS_LIST_MAX_CHECKOUTS_PER_PROJECT + 1 },
          (_, index) => ({ runnerId: "gateway", path: `/repo/mangabaclaw-${index}` }),
        ),
      }),
    ).toBe(false);
    expect(
      Value.Check(ProjectsListResultSchema, {
        projects: [],
        observedProjects: Array.from({ length: PROJECTS_LIST_DEFAULT_LIMIT + 1 }, () => project),
      }),
    ).toBe(false);
  });

  it("accepts projectId as an additive sessions.create parameter", () => {
    expect(validateSessionsCreateParams({ agentId: "main", projectId: "mangabaclaw" })).toBe(true);
    expect(validateSessionsCreateParams({ agentId: "main", projectId: "" })).toBe(false);
  });
});
