/** Process env key that marks child commands as launched by the MangabaClaw CLI. */
export const MANGABACLAW_CLI_ENV_VAR = "MANGABACLAW_CLI";

/** Stable marker value used for MangabaClaw-launched subprocess detection. */
const MANGABACLAW_CLI_ENV_VALUE = "1";

/** Returns a cloned env object with the MangabaClaw CLI marker set. */
export function markMangabaClawExecEnv<T extends Record<string, string | undefined>>(
  /** Source environment to clone before adding the subprocess marker. */
  env: T,
): T {
  return {
    ...env,
    [MANGABACLAW_CLI_ENV_VAR]: MANGABACLAW_CLI_ENV_VALUE,
  };
}

/** Mutates an existing process env object so current-process children inherit the marker. */
export function ensureMangabaClawExecMarkerOnProcess(
  /** Process env object to mutate; defaults to the current process environment. */
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[MANGABACLAW_CLI_ENV_VAR] = MANGABACLAW_CLI_ENV_VALUE;
  return env;
}
