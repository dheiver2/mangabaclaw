import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";

type DiagnosticsTimelineModule = typeof import("../infra/diagnostics-timeline.js");

type CliCommandStartupTimingOptions = {
  config?: MangabaClawConfig;
  env?: NodeJS.ProcessEnv;
};

let diagnosticsTimelineModulePromise: Promise<DiagnosticsTimelineModule> | undefined;

function hasDiagnosticsTimelinePath(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.MANGABACLAW_DIAGNOSTICS_TIMELINE_PATH?.trim());
}

function loadDiagnosticsTimelineModule(): Promise<DiagnosticsTimelineModule> {
  diagnosticsTimelineModulePromise ??= import("../infra/diagnostics-timeline.js");
  return diagnosticsTimelineModulePromise;
}

/** Measures command-specific work hidden inside Commander parse/action dispatch. */
export async function measureCliCommandStartup<T>(
  stage: string,
  run: () => Promise<T> | T,
  options: CliCommandStartupTimingOptions = {},
): Promise<T> {
  const env = options.env ?? process.env;
  if (!hasDiagnosticsTimelinePath(env)) {
    return await run();
  }
  const { measureDiagnosticsTimelineSpan } = await loadDiagnosticsTimelineModule();
  return await measureDiagnosticsTimelineSpan("cli.command-startup", run, {
    config: options.config,
    env,
    phase: "cli.command-startup",
    attributes: { stage },
  });
}
