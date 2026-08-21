import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { isTruthyEnvValue } from "../infra/env.js";
import type { ChannelAutostartSuppression } from "./server-channels.js";

type GatewaySecretsActivationReason = "startup" | "reload" | "restart-check";

/**
 * Keeps the recoverable source config separate from the SecretRef assignment
 * surface that is safe to resolve during crash-loop recovery.
 */
export function resolveGatewayStartupSecretProjection(params: {
  config: MangabaClawConfig;
  reason: GatewaySecretsActivationReason;
  channelAutostartSuppression?: ChannelAutostartSuppression | null;
  env?: NodeJS.ProcessEnv;
}): { sourceConfig: MangabaClawConfig; assignmentConfig?: MangabaClawConfig } {
  const sourceConfig = resolveGatewayStartupSourceConfig(params.config, params.env ?? process.env);
  if (
    params.reason !== "startup" ||
    params.channelAutostartSuppression == null ||
    !sourceConfig.channels
  ) {
    return { sourceConfig };
  }
  return {
    sourceConfig,
    assignmentConfig: {
      ...sourceConfig,
      channels: undefined,
    },
  };
}

export function resolveGatewayStartupSourceConfig(
  config: MangabaClawConfig,
  env: NodeJS.ProcessEnv,
): MangabaClawConfig {
  const skipChannels =
    isTruthyEnvValue(env.MANGABACLAW_SKIP_CHANNELS) || isTruthyEnvValue(env.MANGABACLAW_SKIP_PROVIDERS);
  if (!skipChannels || !config.channels) {
    return config;
  }
  return {
    ...config,
    channels: undefined,
  };
}
