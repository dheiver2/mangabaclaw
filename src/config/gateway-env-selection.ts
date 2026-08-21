import { collectConfigRuntimeEnvVars } from "./env-vars.js";
import type { MangabaClawConfig } from "./types.js";

export const GATEWAY_CONFIG_SELECTION_ENV_KEYS: ReadonlySet<string> = new Set([
  "ANDROID_DATA",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "MANGABACLAW_AGENT_DIR",
  "MANGABACLAW_CONFIG_PATH",
  "MANGABACLAW_HOME",
  "MANGABACLAW_INCLUDE_ROOTS",
  "MANGABACLAW_NIX_MODE",
  "MANGABACLAW_OAUTH_DIR",
  "MANGABACLAW_PACKAGE_DIR",
  "MANGABACLAW_PROFILE",
  "MANGABACLAW_STATE_DIR",
  "MANGABACLAW_WORKSPACE_DIR",
  "PI_CODING_AGENT_DIR",
  "PREFIX",
  "USERPROFILE",
]);

/** Rejects config.env changes that would retarget a running Gateway process. */
export function assertGatewayConfigEnvSelectionUnchanged(
  previousConfig: MangabaClawConfig,
  nextConfig: MangabaClawConfig,
): void {
  const normalize = (config: MangabaClawConfig) =>
    new Map(
      Object.entries(collectConfigRuntimeEnvVars(config)).map(([key, value]) => [
        key.toUpperCase(),
        value,
      ]),
    );
  const previous = normalize(previousConfig);
  const next = normalize(nextConfig);
  for (const key of GATEWAY_CONFIG_SELECTION_ENV_KEYS) {
    if (previous.get(key) !== next.get(key)) {
      throw new Error(
        `Config env cannot change process-stable Gateway selector ${key} during reload. Restart with the target environment instead.`,
      );
    }
  }
}
