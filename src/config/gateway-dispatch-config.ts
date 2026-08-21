// Loads gateway dispatch config from runtime state and files.
import fs from "node:fs";
import path from "node:path";
import { isRecord } from "@mangabaclaw/normalization-core/record-coerce";
import { parseJsonWithJson5Fallback } from "../utils/parse-json-compat.js";
import { applyConfigEnvVars } from "./config-env-vars.js";
import { resolveConfigEnvVars } from "./env-substitution.js";
import { readConfigIncludeFileWithGuards, resolveConfigIncludes } from "./includes.js";
import { resolveConfigPath, resolveIncludeRoots } from "./paths.js";
import type { MangabaClawConfig } from "./types.mangabaclaw.js";

const GATEWAY_DISPATCH_SHELL_ENV_EXPECTED_KEYS = [
  "MANGABACLAW_GATEWAY_TOKEN",
  "MANGABACLAW_GATEWAY_PASSWORD",
] as const;

const GATEWAY_DISPATCH_TOP_LEVEL_KEYS = [
  "agents",
  "env",
  "gateway",
  "plugins",
  "secrets",
  "session",
] as const;

/** Options for reading the reduced config surface used by Gateway dispatch. */
type GatewayDispatchConfigReadOptions = {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Console, "warn" | "error">;
};

function cloneConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneConfigValue(entry));
  }
  if (!isRecord(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = cloneConfigValue(child);
  }
  return out;
}

function projectGatewayDispatchConfig(value: unknown): MangabaClawConfig {
  if (!isRecord(value)) {
    return {};
  }
  const projected: Record<string, unknown> = {};
  for (const key of GATEWAY_DISPATCH_TOP_LEVEL_KEYS) {
    if (Object.hasOwn(value, key)) {
      projected[key] = cloneConfigValue(value[key]);
    }
  }
  return projected as MangabaClawConfig;
}

// Main session keys are process-local; Gateway dispatch always sees the canonical main key.
function applyGatewayDispatchSessionDefaults(config: MangabaClawConfig): MangabaClawConfig {
  if (config.session?.mainKey === undefined) {
    return config;
  }
  return {
    ...config,
    session: { ...config.session, mainKey: "main" },
  };
}

function resolveIncludesForGatewayDispatch(
  parsed: unknown,
  configPath: string,
  env: NodeJS.ProcessEnv,
): unknown {
  return resolveConfigIncludes(
    parsed,
    configPath,
    {
      readFile: (candidate) => fs.readFileSync(candidate, "utf-8"),
      readFileWithGuards: ({ includePath, resolvedPath, rootRealDir }) =>
        readConfigIncludeFileWithGuards({
          includePath,
          resolvedPath,
          rootRealDir,
          ioFs: fs,
        }),
      parseJson: parseJsonWithJson5Fallback,
    },
    { allowedRoots: resolveIncludeRoots(env) },
  );
}

function resolveGatewayDispatchEnvVars(config: unknown, env: NodeJS.ProcessEnv): unknown {
  if (isRecord(config) && Object.hasOwn(config, "env")) {
    applyConfigEnvVars(config as MangabaClawConfig, env);
  }
  return resolveConfigEnvVars(config, env, { onMissing: () => undefined });
}

function readRawGatewayDispatchConfig(options: GatewayDispatchConfigReadOptions = {}): {
  config: MangabaClawConfig;
  configPath: string;
} {
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? resolveConfigPath(env);
  if (!fs.existsSync(configPath)) {
    return { config: {}, configPath };
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = parseJsonWithJson5Fallback(raw);
  const resolvedIncludes = resolveIncludesForGatewayDispatch(parsed, configPath, env);
  const resolvedConfig = resolveGatewayDispatchEnvVars(resolvedIncludes, env);
  return {
    config: applyGatewayDispatchSessionDefaults(projectGatewayDispatchConfig(resolvedConfig)),
    configPath,
  };
}

export function readGatewayDispatchConfig(
  options: GatewayDispatchConfigReadOptions = {},
): MangabaClawConfig {
  return readRawGatewayDispatchConfig(options).config;
}

export async function readGatewayDispatchConfigWithShellEnvFallback(
  options: GatewayDispatchConfigReadOptions = {},
): Promise<MangabaClawConfig> {
  const env = options.env ?? process.env;
  const firstRead = readRawGatewayDispatchConfig(options);
  const {
    loadShellEnvFallback,
    resolveShellEnvFallbackTimeoutMs,
    shouldDeferShellEnvFallback,
    shouldEnableShellEnvFallback,
  } = await import("../infra/shell-env.js");
  const enabled =
    shouldEnableShellEnvFallback(env) || firstRead.config.env?.shellEnv?.enabled === true;
  if (enabled && !shouldDeferShellEnvFallback(env)) {
    loadShellEnvFallback({
      enabled: true,
      env,
      expectedKeys: [...GATEWAY_DISPATCH_SHELL_ENV_EXPECTED_KEYS],
      logger: options.logger ?? console,
      timeoutMs: firstRead.config.env?.shellEnv?.timeoutMs ?? resolveShellEnvFallbackTimeoutMs(env),
    });
  }
  return readGatewayDispatchConfig({ ...options, configPath: path.resolve(firstRead.configPath) });
}
