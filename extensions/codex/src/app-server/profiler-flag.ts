/**
 * Resolves whether Codex app-server profiling instrumentation is enabled by
 * MangabaClaw diagnostic flags.
 */
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { isDiagnosticFlagEnabled } from "mangabaclaw/plugin-sdk/diagnostic-runtime";

const PROFILER_FLAGS = ["profiler", "codex.profiler"] as const;

/** Checks the generic and Codex-specific profiler diagnostic flags. */
export function isCodexAppServerProfilerEnabled(
  config?: MangabaClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return PROFILER_FLAGS.some((flag) => isDiagnosticFlagEnabled(flag, config, env));
}
