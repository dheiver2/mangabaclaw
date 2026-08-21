// Feishu plugin module implements tool result behavior.
import { formatErrorMessage } from "mangabaclaw/plugin-sdk/error-runtime";
import { wrapExternalContent } from "mangabaclaw/plugin-sdk/security-runtime";
import { jsonResult } from "mangabaclaw/plugin-sdk/tool-results";

export function feishuExternalToolResult<TDetails>(details: TDetails) {
  // Only model-visible text is fenced; structured callers retain the exact remote payload.
  return {
    content: [
      {
        type: "text" as const,
        text: wrapExternalContent(JSON.stringify(details, null, 2), {
          source: "api",
          includeWarning: false,
        }),
      },
    ],
    details,
  };
}

export function unknownToolActionResult(action: unknown) {
  return jsonResult({ error: `Unknown action: ${String(action)}` });
}

export function toolExecutionErrorResult(error: unknown) {
  return feishuExternalToolResult({ error: formatErrorMessage(error) });
}
