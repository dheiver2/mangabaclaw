export const MANGABACLAW_TOOLS_MCP_AGENT_SESSION_KEY_ENV = "MANGABACLAW_TOOLS_MCP_AGENT_SESSION_KEY";

export function resolveToolsMcpAgentSessionKey(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env[MANGABACLAW_TOOLS_MCP_AGENT_SESSION_KEY_ENV]?.trim() || undefined;
}
