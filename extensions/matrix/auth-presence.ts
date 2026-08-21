// Matrix plugin module implements auth presence behavior.
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { createPluginStateSyncKeyedStore } from "mangabaclaw/plugin-sdk/plugin-state-store-runtime";
import {
  MATRIX_CREDENTIALS_MAX_ENTRIES,
  MATRIX_CREDENTIALS_NAMESPACE,
  normalizeMatrixStoredCredentials,
  type MatrixCredentialStateRecord,
} from "./src/matrix/credentials-state.js";

type MatrixAuthPresenceParams =
  | {
      cfg: MangabaClawConfig;
      env?: NodeJS.ProcessEnv;
    }
  | MangabaClawConfig;

export function hasAnyMatrixAuth(
  params: MatrixAuthPresenceParams,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const resolvedEnv =
    params && typeof params === "object" && "cfg" in params ? (params.env ?? env) : env;
  try {
    const store = createPluginStateSyncKeyedStore<MatrixCredentialStateRecord>("matrix", {
      namespace: MATRIX_CREDENTIALS_NAMESPACE,
      maxEntries: MATRIX_CREDENTIALS_MAX_ENTRIES,
      overflowPolicy: "reject-new",
      env: resolvedEnv,
    });
    return store.entries().some((entry) => normalizeMatrixStoredCredentials(entry.value) !== null);
  } catch {
    return false;
  }
}
