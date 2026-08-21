import type { CodexPluginConfig } from "./config.js";
import { normalizeCodexDynamicToolName } from "./dynamic-tool-profile.js";

type MangabaClawCodingToolsFactory =
  (typeof import("mangabaclaw/plugin-sdk/agent-harness"))["createMangabaClawCodingTools"];
type MangabaClawDynamicTool = ReturnType<MangabaClawCodingToolsFactory>[number];
type ExecAliasParams =
  | { host: "gateway"; processAliasAvailable: boolean }
  | { host: "node"; node?: string };

export const CODEX_NODE_EXEC_DYNAMIC_TOOL_NAME = "node_exec";
export const CODEX_GATEWAY_EXEC_DYNAMIC_TOOL_NAME = "gateway_exec";
export const CODEX_GATEWAY_PROCESS_DYNAMIC_TOOL_NAME = "gateway_process";
const CODEX_EXEC_POLICY_PARAMETER_NAMES = new Set(["host", "security", "ask"]);
const CODEX_NODE_EXEC_PARAMETER_NAMES = new Set([
  "command",
  "workdir",
  "env",
  "timeoutSeconds",
  "node",
]);
const PROCESS_FOLLOWUP_TEXT =
  "Use process (list/poll/log/write/send-keys/submit/paste/kill/clear/remove) for follow-up.";

/** Returns true when plugin config explicitly removes any named dynamic tool. */
export function isCodexDynamicToolExcluded(
  config: Pick<CodexPluginConfig, "codexDynamicToolsExclude">,
  names: readonly string[],
): boolean {
  const normalizedNames = new Set(names.map((name) => normalizeCodexDynamicToolName(name)));
  return (config.codexDynamicToolsExclude ?? []).some((name) =>
    normalizedNames.has(normalizeCodexDynamicToolName(name)),
  );
}

export function createExecAliasDynamicTool(
  execTool: MangabaClawDynamicTool,
  params: ExecAliasParams,
): MangabaClawDynamicTool {
  const pinnedNode = params.host === "node" ? params.node?.trim() : undefined;
  const nodeAlias = params.host === "node";
  const gatewayProcessAliasAvailable = params.host === "gateway" && params.processAliasAvailable;
  const name = nodeAlias ? CODEX_NODE_EXEC_DYNAMIC_TOOL_NAME : CODEX_GATEWAY_EXEC_DYNAMIC_TOOL_NAME;
  const description = nodeAlias
    ? pinnedNode
      ? "Run a shell command to completion on the MangabaClaw configured remote node for this session. This tool always uses MangabaClaw host=node internally and follows the existing node exec approval and allowlist policy. Remote-node background follow-up is unavailable. Use Codex's native shell for local app-server work."
      : "Run a shell command to completion on an MangabaClaw remote node. Select the node by name or id when multiple nodes are available. This tool always uses MangabaClaw host=node internally and follows the existing node exec approval and allowlist policy. Remote-node background follow-up is unavailable. Use Codex's native shell for local app-server work."
    : "Run a shell command through MangabaClaw on the Gateway host for MangabaClaw-managed Gateway environment access, including Secret Store agent-readable environment values and protected egress sentinels. Native Codex shell remains preferred for ordinary local work. This tool always uses MangabaClaw host=gateway internally and follows Gateway exec approval and allowlist policy.";
  const followupText = nodeAlias
    ? "Remote-node background follow-up is unavailable. Wait for the command to complete."
    : gatewayProcessAliasAvailable
      ? "Use gateway_process (list/poll/log/write/send-keys/submit/paste/kill/clear/remove) for follow-up."
      : "Background session follow-up is unavailable because gateway_process is not exposed. Rerun without background=true and set yieldMs high enough to wait for completion.";
  return {
    ...execTool,
    name,
    description,
    parameters: hideExecDynamicToolParameters(
      execTool.parameters,
      !nodeAlias || Boolean(pinnedNode),
      nodeAlias,
    ),
    execute: async (toolCallId, args, signal, onUpdate) => {
      const result = await execTool.execute(
        toolCallId,
        pinExecDynamicToolArgs(args, params.host, pinnedNode),
        signal,
        onUpdate,
      );
      return {
        ...result,
        content: result.content.map((item) =>
          item.type === "text"
            ? Object.assign({}, item, {
                text: item.text.replace(PROCESS_FOLLOWUP_TEXT, followupText),
              })
            : item,
        ),
      };
    },
  };
}

export function createGatewayProcessAliasDynamicTool(
  processTool: MangabaClawDynamicTool,
): MangabaClawDynamicTool {
  return {
    ...processTool,
    name: CODEX_GATEWAY_PROCESS_DYNAMIC_TOOL_NAME,
    description:
      "Manage background shell sessions in the existing per-session MangabaClaw process scope: list, poll, log, write, send-keys, submit, paste, kill, clear, or remove. Use for gateway_exec follow-up; use native Codex shell session handling for ordinary local work.",
  };
}

function pinExecDynamicToolArgs(
  args: unknown,
  host: "gateway" | "node",
  configuredNode?: string,
): unknown {
  const source = normalizeExecDynamicToolArgs(args);
  const { host: _host, security: _security, ask: _ask, node: requestedNode, ...rest } = source;
  if (host === "gateway") {
    return { ...rest, host };
  }
  const nodeArgs = Object.fromEntries(
    Object.entries(rest).filter(([name]) => CODEX_NODE_EXEC_PARAMETER_NAMES.has(name)),
  );
  const node = configuredNode ?? (typeof requestedNode === "string" ? requestedNode.trim() : "");
  return {
    ...nodeArgs,
    host,
    ...(node ? { node } : {}),
  };
}

function normalizeExecDynamicToolArgs(args: unknown): Record<string, unknown> {
  return args && typeof args === "object" && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
}

function hideExecDynamicToolParameters(
  parameters: MangabaClawDynamicTool["parameters"],
  hideNode: boolean,
  nodeOnly: boolean,
) {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    return parameters;
  }
  const schema = parameters as Record<string, unknown>;
  const rawProperties = schema.properties;
  if (!rawProperties || typeof rawProperties !== "object" || Array.isArray(rawProperties)) {
    return parameters;
  }
  const includeParameter = (name: string) =>
    nodeOnly
      ? CODEX_NODE_EXEC_PARAMETER_NAMES.has(name) && !(hideNode && name === "node")
      : !CODEX_EXEC_POLICY_PARAMETER_NAMES.has(normalizeCodexDynamicToolName(name)) &&
        !(hideNode && normalizeCodexDynamicToolName(name) === "node");
  const nextProperties = Object.fromEntries(
    Object.entries(rawProperties).filter(([name]) => includeParameter(name)),
  );
  const rawRequired = schema.required;
  const nextRequired = Array.isArray(rawRequired)
    ? rawRequired.filter((name) => typeof name !== "string" || includeParameter(name))
    : rawRequired;
  return {
    ...schema,
    properties: nextProperties,
    ...(Array.isArray(rawRequired) ? { required: nextRequired } : {}),
  };
}
