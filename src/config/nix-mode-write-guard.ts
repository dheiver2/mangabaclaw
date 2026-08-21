// Guards config writes that are disallowed in Nix-managed installs.
import { resolveIsNixMode } from "./paths.js";

/** Agent-first Nix install docs shown when runtime config writes are blocked. */
const NIX_MANGABACLAW_AGENT_FIRST_URL = "https://github.com/mangabaclaw/nix-mangabaclaw#quick-start";
/** Public MangabaClaw Nix overview shown with immutable-config errors. */
const MANGABACLAW_NIX_OVERVIEW_URL = "https://docs.mangabaclaw.ai/install/nix";

/** Error thrown when a mutating config path is attempted while Nix owns config state. */
export class NixModeConfigMutationError extends Error {
  readonly code = "MANGABACLAW_NIX_MODE_CONFIG_IMMUTABLE";

  constructor(params: { configPath?: string } = {}) {
    super(formatNixModeConfigMutationMessage(params));
    this.name = "NixModeConfigMutationError";
  }
}

/** Build the operator-facing immutable-config message for Nix-managed installs. */
function formatNixModeConfigMutationMessage(params: { configPath?: string } = {}): string {
  return [
    "Config is managed by Nix (`MANGABACLAW_NIX_MODE=1`), so MangabaClaw treats mangabaclaw.json as immutable.",
    "This usually means nix-mangabaclaw, the first-party Nix distribution, or another Nix-managed package set this mode.",
    ...(params.configPath ? [`Config path: ${params.configPath}`] : []),
    "Do not run setup, onboarding, mangabaclaw update, plugin install/update/uninstall/enable, doctor repair/token-generation, or config set against this file.",
    "Edit the Nix source for this install instead. For nix-mangabaclaw, edit `programs.mangabaclaw.config` or `instances.<name>.config`, then rebuild with Home Manager or NixOS.",
    `Agent-first Nix setup: ${NIX_MANGABACLAW_AGENT_FIRST_URL}`,
    `MangabaClaw Nix overview: ${MANGABACLAW_NIX_OVERVIEW_URL}`,
  ].join("\n");
}

/** Throw when the current environment marks MangabaClaw config as Nix-managed and immutable. */
export function assertConfigWriteAllowedInCurrentMode(
  params: {
    configPath?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): void {
  if (!resolveIsNixMode(params.env)) {
    return;
  }
  // In Nix mode, all writes must happen in the declarative source and then rebuild.
  throw new NixModeConfigMutationError({ configPath: params.configPath });
}
