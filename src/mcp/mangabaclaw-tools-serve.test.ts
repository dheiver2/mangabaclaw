// MangabaClaw MCP tools tests cover core tool server startup and registration.
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashSystemAgentOperation } from "../agents/tools/system-agent-tool.js";
import {
  buildSystemAgentToolsMcpServerConfig,
  MANGABACLAW_TOOLS_MCP_SYSTEM_AGENT_APPROVAL_ARMED_ENV,
  MANGABACLAW_TOOLS_MCP_SYSTEM_AGENT_PROPOSAL_ENV,
  MANGABACLAW_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV,
  MANGABACLAW_TOOLS_MCP_TOOLS_ENV,
  resolveMangabaClawToolsMcpSystemAgentSurface,
  resolveMangabaClawToolsMcpToolSelection,
} from "./mangabaclaw-tools-serve-config.js";
import {
  MANGABACLAW_TOOLS_MCP_AGENT_SESSION_KEY_ENV,
  resolveMangabaClawToolsForMcp,
  resolveMangabaClawToolsMcpAgentSessionKey,
} from "./mangabaclaw-tools-serve.js";
import { createPluginToolsMcpHandlers } from "./plugin-tools-handlers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MangabaClaw tools MCP server", () => {
  it("exposes cron", async () => {
    const handlers = createPluginToolsMcpHandlers(
      resolveMangabaClawToolsForMcp({ agentSessionKey: "agent:worker:main" }),
    );

    const listed = await handlers.listTools();
    expect(listed.tools.map((tool) => tool.name)).toContain("automations");
  });

  it("gates cron trigger surfaces by the host config", () => {
    const jobKeys = (config: unknown) => {
      const [tool] = resolveMangabaClawToolsForMcp({
        agentSessionKey: "agent:worker:main",
        config: config as never,
      });
      if (!tool) {
        throw new Error("expected the automations tool to be resolved");
      }
      const parameters = tool.parameters as unknown as {
        properties: { job: { properties: Record<string, unknown> } };
      };
      return Object.keys(parameters.properties.job.properties);
    };

    expect(jobKeys({ cron: { triggers: { enabled: false } } })).not.toContain("trigger");
    // Absent config means enabled; only an explicit false narrows the surface.
    expect(jobKeys({ cron: {} })).toContain("trigger");
    expect(jobKeys({ cron: { triggers: { enabled: true } } })).toContain("trigger");
  });

  it("requires the managed bridge to pass a real agent session key", () => {
    expect(() => resolveMangabaClawToolsForMcp({ agentSessionKey: "" })).toThrow(
      MANGABACLAW_TOOLS_MCP_AGENT_SESSION_KEY_ENV,
    );
  });

  it("reads the managed bridge agent session key from env", () => {
    expect(
      resolveMangabaClawToolsMcpAgentSessionKey({
        [MANGABACLAW_TOOLS_MCP_AGENT_SESSION_KEY_ENV]: " agent:worker:main ",
      }),
    ).toBe("agent:worker:main");
  });

  it("serves the ring-zero mangabaclaw tool without an agent session key", async () => {
    const handlers = createPluginToolsMcpHandlers(
      resolveMangabaClawToolsForMcp({ tools: ["mangabaclaw"], systemAgentSurface: "cli" }),
    );

    const listed = await handlers.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(["mangabaclaw"]);
  });

  it("returns approved CLI MCP mutations to the host instead of applying them", async () => {
    const operation = { kind: "config-set", path: "gateway.port", value: "19001" } as const;
    vi.stubEnv(MANGABACLAW_TOOLS_MCP_SYSTEM_AGENT_APPROVAL_ARMED_ENV, "1");
    vi.stubEnv(MANGABACLAW_TOOLS_MCP_SYSTEM_AGENT_PROPOSAL_ENV, hashSystemAgentOperation(operation));
    const handlers = createPluginToolsMcpHandlers(
      resolveMangabaClawToolsForMcp({ tools: ["mangabaclaw"], systemAgentSurface: "cli" }),
    );

    const result = await handlers.callTool({
      name: "mangabaclaw",
      arguments: {
        action: "config_set",
        path: "gateway.port",
        value: "19001",
        approved: true,
      },
    });

    expect(JSON.stringify(result)).toContain("directive:approved-operation:");
  });

  it("parses the served tool selection from env and defaults to cron", () => {
    expect(resolveMangabaClawToolsMcpToolSelection({})).toEqual(["cron"]);
    expect(
      resolveMangabaClawToolsMcpToolSelection({
        [MANGABACLAW_TOOLS_MCP_TOOLS_ENV]: " mangabaclaw , cron ",
      }),
    ).toEqual(["mangabaclaw", "cron"]);
    expect(() =>
      resolveMangabaClawToolsMcpToolSelection({ [MANGABACLAW_TOOLS_MCP_TOOLS_ENV]: "exec" }),
    ).toThrow(MANGABACLAW_TOOLS_MCP_TOOLS_ENV);
  });

  it("parses the mangabaclaw surface from env and defaults to cli", () => {
    expect(resolveMangabaClawToolsMcpSystemAgentSurface({})).toBe("cli");
    expect(
      resolveMangabaClawToolsMcpSystemAgentSurface({
        [MANGABACLAW_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV]: "gateway",
      }),
    ).toBe("gateway");
    expect(() =>
      resolveMangabaClawToolsMcpSystemAgentSurface({
        [MANGABACLAW_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV]: "remote",
      }),
    ).toThrow(MANGABACLAW_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV);
  });

  it("builds a mangabaclaw-only stdio server config under the mangabaclaw name", () => {
    const config = buildSystemAgentToolsMcpServerConfig({ surface: "gateway" });

    expect(Object.keys(config.mcpServers)).toEqual(["mangabaclaw"]);
    const server = config.mcpServers.mangabaclaw as {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    };
    expect(server.command).toBe(process.execPath);
    expect(server.args?.at(-1)).toMatch(/mangabaclaw-tools-serve\.(js|ts)$/);
    expect(server.env).toEqual({
      [MANGABACLAW_TOOLS_MCP_TOOLS_ENV]: "mangabaclaw",
      [MANGABACLAW_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV]: "gateway",
    });
  });
});
