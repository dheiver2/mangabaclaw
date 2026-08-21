/**
 * Standalone MCP server for selected built-in MangabaClaw tools.
 *
 * Run via: node --import tsx src/mcp/mangabaclaw-tools-serve.ts
 * Or: bun src/mcp/mangabaclaw-tools-serve.ts
 */
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { AUTOMATIONS_TOOL_NAME } from "../agents/tools/automations-tool-name.js";
import type { AnyAgentTool } from "../agents/tools/common.js";
import { createCronTool } from "../agents/tools/cron-tool.js";
import { createSystemAgentTool } from "../agents/tools/system-agent-tool.js";
import type { SystemAgentToolOptions } from "../agents/tools/system-agent-tool.js";
import { getRuntimeConfig } from "../config/config.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { formatErrorMessage } from "../infra/errors.js";
import {
  MANGABACLAW_TOOLS_MCP_AGENT_SESSION_KEY_ENV,
  resolveToolsMcpAgentSessionKey,
} from "./agent-session-env.js";
import {
  resolveMangabaClawToolsMcpSystemAgentApproval,
  resolveMangabaClawToolsMcpSystemAgentSurface,
  resolveMangabaClawToolsMcpToolSelection,
  type MangabaClawToolsMcpToolId,
} from "./mangabaclaw-tools-serve-config.js";
import { connectToolsMcpServerToStdio, createToolsMcpServer } from "./tools-stdio-server.js";

export {
  MANGABACLAW_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV,
  MANGABACLAW_TOOLS_MCP_TOOLS_ENV,
} from "./mangabaclaw-tools-serve-config.js";

export { MANGABACLAW_TOOLS_MCP_AGENT_SESSION_KEY_ENV } from "./agent-session-env.js";

export function resolveMangabaClawToolsMcpAgentSessionKey(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return resolveToolsMcpAgentSessionKey(env);
}

export function resolveMangabaClawToolsForMcp(
  params: {
    agentSessionKey?: string;
    tools?: MangabaClawToolsMcpToolId[];
    systemAgentSurface?: SystemAgentToolOptions["surface"];
    config?: MangabaClawConfig;
  } = {},
): AnyAgentTool[] {
  const selection = params.tools ?? resolveMangabaClawToolsMcpToolSelection();
  return selection.map((tool) => {
    if (tool === "mangabaclaw") {
      return createSystemAgentTool({
        surface: params.systemAgentSurface ?? resolveMangabaClawToolsMcpSystemAgentSurface(),
        ...resolveMangabaClawToolsMcpSystemAgentApproval(),
      });
    }
    const agentSessionKey = (
      params.agentSessionKey ?? resolveMangabaClawToolsMcpAgentSessionKey()
    )?.trim();
    if (!agentSessionKey) {
      throw new Error(`${MANGABACLAW_TOOLS_MCP_AGENT_SESSION_KEY_ENV} is required`);
    }
    return createCronTool({
      agentSessionKey,
      // Same host-config resolution as plugin-tools-serve: the advertised cron
      // surface must reflect this deployment's cron.triggers.enabled gate.
      config: params.config ?? getRuntimeConfig(),
      creatorToolAllowlist: [{ name: AUTOMATIONS_TOOL_NAME }],
    });
  });
}

function createMangabaClawToolsMcpServer(
  params: {
    tools?: AnyAgentTool[];
  } = {},
): Server {
  const tools = params.tools ?? resolveMangabaClawToolsForMcp();
  return createToolsMcpServer({ name: "mangabaclaw-tools", tools });
}

async function serveMangabaClawToolsMcp(): Promise<void> {
  const server = createMangabaClawToolsMcpServer();
  await connectToolsMcpServerToStdio(server);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  serveMangabaClawToolsMcp().catch((err: unknown) => {
    process.stderr.write(`mangabaclaw-tools-serve: ${formatErrorMessage(err)}\n`);
    process.exit(1);
  });
}
