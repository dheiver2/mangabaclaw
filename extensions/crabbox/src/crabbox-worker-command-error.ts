import { redactSensitiveText } from "mangabaclaw/plugin-sdk/logging-core";
import { WorkerProviderError } from "mangabaclaw/plugin-sdk/plugin-entry";
import type { SpawnResult } from "mangabaclaw/plugin-sdk/process-runtime";
import { truncateUtf16Safe } from "mangabaclaw/plugin-sdk/text-utility-runtime";

const MAX_COMMAND_DETAIL_CHARS = 512;

function crabboxCommandDetail(result: SpawnResult): string {
  const raw = (result.stderr || result.stdout).trim();
  if (!raw) {
    return "";
  }
  const compressed = redactSensitiveText(raw).replace(/\s+/gu, " ");
  const redacted = truncateUtf16Safe(compressed, MAX_COMMAND_DETAIL_CHARS);
  return redacted ? `: ${redacted}` : "";
}

export function crabboxCommandError(action: string, result: SpawnResult): Error {
  if (result.termination !== "exit") {
    return new Error(`Crabbox ${action} did not exit normally (${result.termination})`);
  }
  const exitCode = result.code === null ? "unknown" : String(result.code);
  return new Error(
    `Crabbox ${action} failed with exit code ${exitCode}${crabboxCommandDetail(result)}`,
  );
}

export function permanentCrabboxCommandError(
  action: string,
  result: SpawnResult,
): WorkerProviderError {
  return new WorkerProviderError(crabboxCommandError(action, result).message);
}
