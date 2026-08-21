/**
 * Tests trigger and session routing during tool assembly.
 * Ensures cron runs scope cron tool behavior to self-removal of the current
 * job only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnyAgentTool } from "./tools/common.js";

const mocks = vi.hoisted(() => {
  const stubTool = (name: string) =>
    ({
      name,
      label: name,
      displaySummary: name,
      description: name,
      parameters: { type: "object", properties: {} },
      execute: vi.fn(),
    }) satisfies AnyAgentTool;

  return {
    createMangabaClawToolsOptions: vi.fn(),
    stubTool,
  };
});

vi.mock("./mangabaclaw-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mangabaclaw-tools.js")>();
  return {
    createMangabaClawTools: (options: unknown) => {
      mocks.createMangabaClawToolsOptions(options);
      return [mocks.stubTool(AUTOMATIONS_TOOL_NAME)];
    },
    filterToolsByClientCaps: actual.filterToolsByClientCaps,
  };
});

import "./test-helpers/fast-bash-tools.js";
import "./test-helpers/fast-coding-tools.js";
import { createMangabaClawCodingTools } from "./agent-tools.js";
import { AUTOMATIONS_TOOL_NAME } from "./tools/automations-tool-name.js";

function firstMangabaClawToolsOptions(): { cronSelfRemoveOnlyJobId?: string } | undefined {
  return mocks.createMangabaClawToolsOptions.mock.calls[0]?.[0] as
    | { cronSelfRemoveOnlyJobId?: string }
    | undefined;
}

describe("createMangabaClawCodingTools cron scope", () => {
  beforeEach(() => {
    mocks.createMangabaClawToolsOptions.mockClear();
  });

  it("scopes cron-triggered jobs to self-removal", () => {
    const tools = createMangabaClawCodingTools({
      trigger: "cron",
      jobId: "job-current",
    });

    expect(tools.map((tool) => tool.name)).toContain(AUTOMATIONS_TOOL_NAME);
    expect(firstMangabaClawToolsOptions()?.cronSelfRemoveOnlyJobId).toBe("job-current");
  });

  it("does not scope non-cron sessions", () => {
    createMangabaClawCodingTools({
      trigger: "user",
      jobId: "job-current",
    });

    expect(firstMangabaClawToolsOptions()?.cronSelfRemoveOnlyJobId).toBeUndefined();
  });
});

const createLazyExecToolMock = vi.hoisted(() => vi.fn());

vi.mock("./lazy-exec-tool.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lazy-exec-tool.js")>();
  return {
    ...actual,
    createLazyExecTool: (defaults: unknown) => {
      createLazyExecToolMock(defaults);
      return {
        name: "exec",
        description: "exec stub",
        parameters: { type: "object", properties: {} },
        execute: vi.fn(),
      };
    },
  };
});

describe("createMangabaClawCodingTools exec notification routing", () => {
  it("routes detached completions to the live session without changing process scope", () => {
    const liveSessionKey = "agent:main:channel:group:example:thread:25";
    const policySessionKey = "agent:main:runtime-policy";

    createMangabaClawCodingTools({
      sessionKey: policySessionKey,
      runSessionKey: liveSessionKey,
      toolConstructionPlan: {
        includeBaseCodingTools: false,
        includeShellTools: true,
        includeChannelTools: false,
        includeMangabaClawTools: false,
        includePluginTools: false,
      },
    });

    expect(createLazyExecToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeKey: policySessionKey,
        sessionKey: policySessionKey,
        notifySessionKey: liveSessionKey,
      }),
    );
  });
});
