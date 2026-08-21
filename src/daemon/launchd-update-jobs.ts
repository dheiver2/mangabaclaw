/** Discovery and shutdown of stale MangabaClaw launchd updater jobs. */
import path from "node:path";
import {
  parseStrictInteger,
  parseStrictPositiveInteger,
} from "@mangabaclaw/normalization-core/number-coercion";
import {
  GATEWAY_SERVICE_KIND,
  GATEWAY_SERVICE_MARKER,
  resolveGatewayLaunchAgentLabel,
} from "./constants.js";
import { isCurrentProcessLaunchdServiceLabel } from "./launchd-current-service.js";
import { execLaunchctl } from "./launchd-exec.js";
import { assertValidLaunchAgentLabel } from "./launchd-label.js";
import { readLaunchAgentProgramArgumentsFromFile } from "./launchd-plist.js";
import { resolveLaunchAgentGuiDomain } from "./launchd-runtime.js";
import { resolveLaunchAgentPlistPathForLabel } from "./launchd-service-files.js";

const MANGABACLAW_UPDATE_LAUNCHD_LABEL_PREFIX = "ai.mangabaclaw.update.";
const MANGABACLAW_MANUAL_UPDATE_LAUNCHD_LABEL_PATTERN = /^ai\.mangabaclaw\.manual-update\.\d+$/;
const MANGABACLAW_PROFILE_UPDATE_LAUNCHD_LABEL_PATTERN =
  /^ai\.mangabaclaw\.[A-Za-z0-9._-]+\.update\.[A-Za-z0-9._-]+$/;
const MANGABACLAW_DIRECT_CLI_NAMES = new Set(["mangabaclaw", "mangabaclaw.mjs"]);
const MANGABACLAW_NODE_RUNTIME_NAMES = new Set(["bun", "bun.exe", "node", "node.exe"]);
const MANGABACLAW_SCRIPT_NAMES = new Set(["mangabaclaw.mjs"]);
export type StaleMangabaClawUpdateLaunchdJob = {
  label: string;
  pid?: number;
  lastExitStatus?: number;
};

type MangabaClawUpdateLaunchdLabelCandidate = {
  label: string;
  requiresMetadata: boolean;
};

function normalizeMangabaClawUpdateLaunchdLabel(label: unknown): string | null {
  if (typeof label !== "string") {
    return null;
  }
  const trimmed = label.trim();
  if (trimmed.startsWith(MANGABACLAW_UPDATE_LAUNCHD_LABEL_PREFIX)) {
    return trimmed;
  }
  // Manual update jobs include a timestamp-like suffix and should be cleaned up
  // without matching arbitrary ai.mangabaclaw labels.
  return MANGABACLAW_MANUAL_UPDATE_LAUNCHD_LABEL_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeMangabaClawUpdateLaunchdLabelCandidate(
  label: unknown,
): MangabaClawUpdateLaunchdLabelCandidate | null {
  const normalized = normalizeMangabaClawUpdateLaunchdLabel(label);
  if (normalized) {
    return { label: normalized, requiresMetadata: false };
  }
  if (typeof label !== "string") {
    return null;
  }
  const trimmed = label.trim();
  return MANGABACLAW_PROFILE_UPDATE_LAUNCHD_LABEL_PATTERN.test(trimmed)
    ? { label: trimmed, requiresMetadata: true }
    : null;
}

function isCurrentGatewayLaunchdLabel(label: string, env: NodeJS.ProcessEnv): boolean {
  const gatewayProfileLabel = resolveGatewayLaunchAgentLabel(env.MANGABACLAW_PROFILE);
  if (label === gatewayProfileLabel) {
    return true;
  }
  if (
    env.MANGABACLAW_SERVICE_MARKER?.trim() !== GATEWAY_SERVICE_MARKER ||
    env.MANGABACLAW_SERVICE_KIND?.trim() !== GATEWAY_SERVICE_KIND
  ) {
    return false;
  }
  const configuredLabel = env.MANGABACLAW_LAUNCHD_LABEL?.trim();
  return Boolean(configuredLabel && label === configuredLabel);
}

function resolveCurrentMangabaClawUpdateLaunchdJobLabel(
  env: NodeJS.ProcessEnv = process.env,
): MangabaClawUpdateLaunchdLabelCandidate | null {
  for (const label of [
    env.LAUNCH_JOB_LABEL,
    env.LAUNCH_JOB_NAME,
    env.XPC_SERVICE_NAME,
    env.MANGABACLAW_LAUNCHD_LABEL,
  ]) {
    const candidate = normalizeMangabaClawUpdateLaunchdLabelCandidate(label);
    if (candidate) {
      if (isCurrentGatewayLaunchdLabel(candidate.label, env)) {
        continue;
      }
      return candidate;
    }
  }
  return null;
}

export function parseLaunchctlListMangabaClawUpdateJobs(
  output: string,
): StaleMangabaClawUpdateLaunchdJob[] {
  return parseLaunchctlListMangabaClawUpdateJobCandidates(output)
    .filter((job) => !job.requiresMetadata)
    .map(({ requiresMetadata: _requiresMetadata, ...job }) => job);
}

function parseLaunchctlListMangabaClawUpdateJobCandidates(
  output: string,
): Array<StaleMangabaClawUpdateLaunchdJob & MangabaClawUpdateLaunchdLabelCandidate> {
  const jobs: Array<StaleMangabaClawUpdateLaunchdJob & MangabaClawUpdateLaunchdLabelCandidate> = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const parts = line.split(/\s+/);
    const [pidRaw, statusRaw, ...labelParts] = parts;
    const candidate = normalizeMangabaClawUpdateLaunchdLabelCandidate(labelParts.join(" "));
    if (!candidate) {
      continue;
    }
    const pid = pidRaw === "-" ? undefined : parseStrictPositiveInteger(pidRaw ?? "");
    const lastExitStatus = parseStrictInteger(statusRaw ?? "");
    jobs.push({
      label: candidate.label,
      requiresMetadata: candidate.requiresMetadata,
      ...(pid !== undefined ? { pid } : {}),
      ...(lastExitStatus !== undefined ? { lastExitStatus } : {}),
    });
  }
  return jobs.toSorted((a, b) => a.label.localeCompare(b.label));
}

function hasMangabaClawUpdateLaunchdMarker(env: Record<string, string | undefined> | undefined) {
  return env?.MANGABACLAW_UPDATE_RUN_HANDOFF?.trim() === "1";
}

function isMangabaClawUpdateCommandPrefix(programArguments: string[], updateIndex: number): boolean {
  if (updateIndex === 1) {
    const cliName = path.basename(programArguments[0] ?? "").toLowerCase();
    return MANGABACLAW_DIRECT_CLI_NAMES.has(cliName);
  }
  if (updateIndex !== 2) {
    return false;
  }
  const runtimeName = path.basename(programArguments[0] ?? "").toLowerCase();
  const entryName = path.basename(programArguments[1] ?? "").toLowerCase();
  return MANGABACLAW_NODE_RUNTIME_NAMES.has(runtimeName) && MANGABACLAW_SCRIPT_NAMES.has(entryName);
}

function isMangabaClawUpdateProgramArguments(programArguments: string[] | undefined): boolean {
  if (!Array.isArray(programArguments) || programArguments.length === 0) {
    return false;
  }
  const updateIndex = programArguments.findIndex((arg) => arg.trim() === "update");
  if (updateIndex < 0 || !programArguments.slice(updateIndex + 1).includes("--yes")) {
    return false;
  }
  return (
    isMangabaClawUpdateCommandPrefix(programArguments, updateIndex) &&
    !programArguments.some((arg) => arg.trim() === "gateway")
  );
}

async function isLaunchdJobConfirmedMangabaClawUpdater(params: {
  label: string;
  env: NodeJS.ProcessEnv;
}): Promise<boolean> {
  const plistPath = resolveLaunchAgentPlistPathForLabel(params.env, params.label);
  const command = await readLaunchAgentProgramArgumentsFromFile(plistPath);
  return (
    hasMangabaClawUpdateLaunchdMarker(command?.environment) ||
    isMangabaClawUpdateProgramArguments(command?.programArguments)
  );
}

export async function findStaleMangabaClawUpdateLaunchdJobs(
  env: NodeJS.ProcessEnv = process.env,
): Promise<StaleMangabaClawUpdateLaunchdJob[]> {
  if (process.platform !== "darwin") {
    return [];
  }
  const result = await execLaunchctl(["list"]);
  if (result.code !== 0) {
    return [];
  }
  // Never report the active gateway label as stale even when a wrapper exposes
  // update-like launchd metadata through the current environment.
  const jobs: StaleMangabaClawUpdateLaunchdJob[] = [];
  for (const job of parseLaunchctlListMangabaClawUpdateJobCandidates(result.stdout)) {
    if (isCurrentGatewayLaunchdLabel(job.label, env)) {
      continue;
    }
    if (
      job.requiresMetadata &&
      !(await isLaunchdJobConfirmedMangabaClawUpdater({ label: job.label, env }))
    ) {
      continue;
    }
    jobs.push({
      label: job.label,
      ...(job.pid !== undefined ? { pid: job.pid } : {}),
      ...(job.lastExitStatus !== undefined ? { lastExitStatus: job.lastExitStatus } : {}),
    });
  }
  return jobs;
}

async function disableMangabaClawUpdateLaunchdJobCandidate(params: {
  candidate: MangabaClawUpdateLaunchdLabelCandidate;
  env: NodeJS.ProcessEnv;
  trustCurrentEnvMarker: boolean;
}): Promise<boolean> {
  if (process.platform !== "darwin") {
    return false;
  }
  if (
    params.candidate.requiresMetadata &&
    !(
      (params.trustCurrentEnvMarker && hasMangabaClawUpdateLaunchdMarker(params.env)) ||
      (await isLaunchdJobConfirmedMangabaClawUpdater({
        label: params.candidate.label,
        env: params.env,
      }))
    )
  ) {
    return false;
  }
  const serviceTarget = `${resolveLaunchAgentGuiDomain()}/${assertValidLaunchAgentLabel(params.candidate.label)}`;
  const result = await execLaunchctl(["disable", serviceTarget]);
  return result.code === 0;
}

export async function disableMangabaClawUpdateLaunchdJob(
  label: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const candidate = normalizeMangabaClawUpdateLaunchdLabelCandidate(label);
  if (!candidate) {
    return false;
  }
  return await disableMangabaClawUpdateLaunchdJobCandidate({
    candidate,
    env,
    trustCurrentEnvMarker: false,
  });
}

export async function disableCurrentMangabaClawUpdateLaunchdJob(
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const candidate = resolveCurrentMangabaClawUpdateLaunchdJobLabel(env);
  if (!candidate) {
    return false;
  }
  return await disableMangabaClawUpdateLaunchdJobCandidate({
    candidate,
    env,
    // Detached handoffs preserve the configured label, so only launchd-backed
    // current-process identity may turn the ambient marker into proof.
    trustCurrentEnvMarker: isCurrentProcessLaunchdServiceLabel(candidate.label, env, {
      allowConfiguredLabelFallback: false,
    }),
  });
}
