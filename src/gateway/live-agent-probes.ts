// Gateway live agent probe helpers.
// Builds prompts and verification helpers for live image and cron probe tests.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  resolveExpiresAtMsFromDurationSeconds,
  resolveTimestampMsToIsoString,
} from "@mangabaclaw/normalization-core/number-coercion";
import { normalizeOptionalLowercaseString } from "@mangabaclaw/normalization-core/string-coerce";
import { isTruthyEnvValue } from "../infra/env.js";
import { runExec } from "../process/exec.js";

const LIVE_CRON_PROBE_DELAY_SECONDS = 7 * 24 * 60 * 60;
const MANGABACLAW_CLI_GATEWAY_TIMEOUT_MS = 30_000;
const MANGABACLAW_CLI_CHILD_TIMEOUT_MS = MANGABACLAW_CLI_GATEWAY_TIMEOUT_MS + 45_000;

type CronListCliResult = {
  jobs?: Array<{
    id?: string;
    name?: string;
    sessionTarget?: string;
    agentId?: string | null;
    sessionKey?: string | null;
    payload?: { kind?: string; text?: string; message?: string };
  }>;
};

export type CronListJob = NonNullable<CronListCliResult["jobs"]>[number];

type LiveCronProbeSpec = {
  nonce: string;
  name: string;
  message: string;
  at: string;
  argsJson: string;
};

/** Selects the packaged launcher when built, otherwise the canonical source runner. */
export function resolveMangabaClawCliProcessArgs(
  args: readonly string[],
  hasBuildOutput: boolean,
): string[] {
  return [hasBuildOutput ? "mangabaclaw.mjs" : "scripts/run-node.mjs", ...args];
}

/** Return true for live agents that expose Claude-style MCP tool names. */
export function isClaudeLikeLiveAgent(raw: string): boolean {
  const normalized = normalizeOptionalLowercaseString(raw);
  return normalized === "claude" || normalized === "claude-cli";
}

/** Assert the live image probe answered with the expected cat description. */
export function assertLiveImageProbeReply(text: string): void {
  const normalized = normalizeOptionalLowercaseString(text);
  if (normalized !== "cat" && !/(^|[^a-z])cat[.!?`'")\]]*$/.test(normalized ?? "")) {
    throw new Error(`image probe expected 'cat', got: ${normalized}`);
  }
}

/** Resolve whether a live image probe should run for this agent/override. */
export function shouldRunLiveImageProbe(params: { agent: string; override?: string }): boolean {
  const override = params.override?.trim();
  if (override) {
    return isTruthyEnvValue(override);
  }
  return normalizeOptionalLowercaseString(params.agent) !== "opencode";
}

export function createLiveCronProbeSpec(
  params: {
    agentId?: string;
    sessionKey?: string;
  } = {},
): LiveCronProbeSpec {
  const nonce = randomBytes(3).toString("hex").toUpperCase();
  const normalizedNonce = normalizeOptionalLowercaseString(nonce) ?? "";
  const name = `live-mcp-${normalizedNonce}`;
  const message = `probe-${normalizedNonce}`;
  const at = resolveTimestampMsToIsoString(
    resolveExpiresAtMsFromDurationSeconds(LIVE_CRON_PROBE_DELAY_SECONDS) ?? Date.now(),
  );
  const argsJson = JSON.stringify({
    action: "add",
    job: {
      name,
      schedule: { kind: "at", at },
      payload: { kind: "agentTurn", message },
      // Live harnesses use synthetic channels that must not become announce targets.
      delivery: { mode: "none" },
      sessionTarget: params.sessionKey ? `session:${params.sessionKey}` : "current",
      ...(params.agentId ? { agentId: params.agentId } : {}),
      ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
      enabled: true,
    },
  });
  return { nonce, name, message, at, argsJson };
}

export function buildLiveCronProbeMessage(params: {
  agent: string;
  argsJson: string;
  attempt: number;
  exactReply: string;
}): string {
  const claudeLike = isClaudeLikeLiveAgent(params.agent);
  if (params.attempt === 0) {
    return (
      "Use the MangabaClaw MCP automations tool from server `mangabaclaw`. " +
      "If it is not already visible, search/load MCP tools for `mangabaclaw automations` or `automations`, " +
      "then call the matching MangabaClaw MCP tool; Claude-style names may appear as `mcp__mangabaclaw__automations`. " +
      "Do not use Claude native `CronCreate`, `CronList`, or `CronDelete`; those are not MangabaClaw proof. " +
      `Call it with JSON arguments ${params.argsJson}. ` +
      "Preserve the JSON exactly, including job.sessionTarget and job.sessionKey; do not omit, rename, or flatten those fields. " +
      "Do the actual tool call; I will verify externally with the MangabaClaw cron CLI. " +
      `After the cron job is created, reply exactly: ${params.exactReply}`
    );
  }
  if (claudeLike) {
    return (
      "Retry the MangabaClaw MCP automations tool from server `mangabaclaw` now. " +
      "If it is not already visible, search/load MCP tools for `mangabaclaw automations` or `automations`, " +
      "then call the matching MangabaClaw MCP tool; Claude-style names may appear as `mcp__mangabaclaw__automations`. " +
      "Do not use Claude native `CronCreate`, `CronList`, or `CronDelete`; those are not MangabaClaw proof. " +
      `Use these exact JSON arguments: ${params.argsJson}. ` +
      "Preserve job.sessionTarget and job.sessionKey exactly as provided. " +
      `If the cron job is created, reply exactly: ${params.exactReply}. ` +
      "If the tool call is cancelled, the job is not created, or you cannot confirm creation, " +
      "reply briefly saying that and ask me to retry. No markdown. " +
      "I will verify externally with the MangabaClaw cron CLI."
    );
  }
  return (
    "Your previous MangabaClaw automations MCP tool call was cancelled before the job was created. " +
    "Retry the MangabaClaw MCP automations tool from server `mangabaclaw` now. " +
    "If the harness shows Claude-style MCP names, use `mcp__mangabaclaw__automations`. " +
    `Use these exact JSON arguments: ${params.argsJson}. ` +
    "Preserve job.sessionTarget and job.sessionKey exactly as provided. " +
    `If the cron job is created, reply exactly: ${params.exactReply}. ` +
    "If the tool call is cancelled, the job is not created, or you cannot confirm creation, " +
    "reply briefly saying that and ask me to retry. No markdown. " +
    "I will verify externally with the MangabaClaw cron CLI."
  );
}

export async function runMangabaClawCliJson<T>(args: string[], env: NodeJS.ProcessEnv): Promise<T> {
  const childEnv = { ...env };
  delete childEnv.VITEST;
  delete childEnv.VITEST_MODE;
  delete childEnv.VITEST_POOL_ID;
  delete childEnv.VITEST_WORKER_ID;
  const cliArgs = args.includes("--timeout")
    ? args
    : [...args, "--timeout", String(MANGABACLAW_CLI_GATEWAY_TIMEOUT_MS)];
  const hasBuildOutput = ["entry.js", "entry.mjs"].some((entry) =>
    fs.existsSync(path.join(process.cwd(), "dist", entry)),
  );
  const { stdout, stderr } = await runExec(
    process.execPath,
    resolveMangabaClawCliProcessArgs(cliArgs, hasBuildOutput),
    {
      baseEnv: childEnv,
      cwd: process.cwd(),
      logOutput: false,
      maxBuffer: 1024 * 1024,
      timeoutMs: MANGABACLAW_CLI_CHILD_TIMEOUT_MS,
    },
  );
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error(
      [
        `mangabaclaw ${args.join(" ")} produced no JSON stdout`,
        stderr.trim() ? `stderr: ${stderr.trim()}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    throw new Error(
      [
        `mangabaclaw ${args.join(" ")} returned invalid JSON`,
        `stdout: ${trimmed}`,
        stderr.trim() ? `stderr: ${stderr.trim()}` : undefined,
        error instanceof Error ? `cause: ${error.message}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      { cause: error },
    );
  }
}

export async function assertCronJobVisibleViaCli(params: {
  port: number;
  token: string;
  env: NodeJS.ProcessEnv;
  expectedName: string;
  expectedMessage: string;
}): Promise<CronListJob | undefined> {
  const cronList = await runMangabaClawCliJson<CronListCliResult>(
    [
      "cron",
      "list",
      "--all",
      "--json",
      "--url",
      `ws://127.0.0.1:${params.port}`,
      "--token",
      params.token,
    ],
    params.env,
  );
  return (
    cronList.jobs?.find((job) => job.name === params.expectedName) ??
    cronList.jobs?.find((job) => job.payload?.message === params.expectedMessage)
  );
}

export function assertCronJobMatches(params: {
  job: CronListJob;
  expectedName: string;
  expectedMessage: string;
  expectedSessionKey: string;
  expectedSessionTarget?: string;
  expectedAgentId?: string;
}) {
  if (params.job.name !== params.expectedName) {
    throw new Error(`cron job name mismatch: ${params.job.name ?? "<missing>"}`);
  }
  if (params.job.payload?.kind !== "agentTurn") {
    throw new Error(`cron payload kind mismatch: ${params.job.payload?.kind ?? "<missing>"}`);
  }
  if (params.job.payload?.message !== params.expectedMessage) {
    throw new Error(`cron payload message mismatch: ${params.job.payload?.message ?? "<missing>"}`);
  }
  const expectedAgentId = params.expectedAgentId ?? "dev";
  if (params.job.agentId !== expectedAgentId) {
    throw new Error(`cron agentId mismatch: ${params.job.agentId ?? "<missing>"}`);
  }
  if (params.job.sessionKey !== params.expectedSessionKey) {
    throw new Error(`cron sessionKey mismatch: ${params.job.sessionKey ?? "<missing>"}`);
  }
  const expectedSessionTarget =
    params.expectedSessionTarget ?? `session:${params.expectedSessionKey}`;
  if (params.job.sessionTarget !== expectedSessionTarget) {
    throw new Error(`cron sessionTarget mismatch: ${params.job.sessionTarget ?? "<missing>"}`);
  }
}
