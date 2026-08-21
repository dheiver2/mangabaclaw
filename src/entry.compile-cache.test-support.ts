import type { ChildProcess } from "node:child_process";
import type { RespawnChildRuntime } from "./process/respawn-child-runner.js";
import "./entry.compile-cache.js";

type CompileCacheParams = {
  env?: NodeJS.ProcessEnv;
  installRoot: string;
};

type CompileCacheRespawnPlan = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  detachForProcessTree: boolean;
};

type CompileCacheTestApi = {
  buildMangabaClawCompileCacheRespawnPlan(params: {
    currentFile: string;
    env?: NodeJS.ProcessEnv;
    execArgv?: string[];
    execPath?: string;
    installRoot: string;
    argv?: string[];
    compileCacheDir?: string;
    platform?: NodeJS.Platform;
  }): CompileCacheRespawnPlan | undefined;
  isSourceCheckoutInstallRoot(installRoot: string): boolean;
  resolveMangabaClawCompileCacheDirectory(params: {
    env?: NodeJS.ProcessEnv;
    installRoot: string;
  }): string;
  runMangabaClawCompileCacheRespawnPlan(
    plan: CompileCacheRespawnPlan,
    runtime?: RespawnChildRuntime & { writeError(message: string): void },
  ): ChildProcess;
  shouldEnableMangabaClawCompileCache(params: CompileCacheParams): boolean;
};

function getTestApi(): CompileCacheTestApi {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("mangabaclaw.entryCompileCacheTestApi")
  ] as CompileCacheTestApi;
}

export function buildMangabaClawCompileCacheRespawnPlan(
  params: Parameters<CompileCacheTestApi["buildMangabaClawCompileCacheRespawnPlan"]>[0],
): CompileCacheRespawnPlan | undefined {
  return getTestApi().buildMangabaClawCompileCacheRespawnPlan(params);
}

export function isSourceCheckoutInstallRoot(installRoot: string): boolean {
  return getTestApi().isSourceCheckoutInstallRoot(installRoot);
}

export function resolveMangabaClawCompileCacheDirectory(
  params: Parameters<CompileCacheTestApi["resolveMangabaClawCompileCacheDirectory"]>[0],
): string {
  return getTestApi().resolveMangabaClawCompileCacheDirectory(params);
}

export function runMangabaClawCompileCacheRespawnPlan(
  ...args: Parameters<CompileCacheTestApi["runMangabaClawCompileCacheRespawnPlan"]>
): ChildProcess {
  return getTestApi().runMangabaClawCompileCacheRespawnPlan(...args);
}

export function shouldEnableMangabaClawCompileCache(params: CompileCacheParams): boolean {
  return getTestApi().shouldEnableMangabaClawCompileCache(params);
}
