/** Detects whether a daemon was launched by MangabaClaw's container-aware service wrapper. */
import { normalizeOptionalString } from "@mangabaclaw/normalization-core/string-coerce";

/** Resolves the daemon container hint exposed by managed service environments. */
export function resolveDaemonContainerContext(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return (
    normalizeOptionalString(env.MANGABACLAW_CONTAINER_HINT) ||
    normalizeOptionalString(env.MANGABACLAW_CONTAINER) ||
    null
  );
}
