// Matrix API module exposes the plugin public contract.
import { chunkTextForOutbound as chunkTextForOutboundSdk } from "mangabaclaw/plugin-sdk/text-chunking";

export {
  type MatrixResolvedStringField,
  type MatrixResolvedStringValues,
  resolveMatrixAccountStringValues,
} from "./src/auth-precedence.js";
export {
  requiresExplicitMatrixDefaultAccount,
  resolveMatrixDefaultOrOnlyAccountId,
} from "./src/account-selection.js";
export {
  findMatrixAccountEntry,
  resolveConfiguredMatrixAccountIds,
  resolveMatrixChannelConfig,
} from "./src/account-selection.js";
export {
  getMatrixScopedEnvVarNames,
  listMatrixEnvAccountIds,
  resolveMatrixEnvAccountToken,
} from "./src/env-vars.js";
export {
  hashMatrixAccessToken,
  resolveMatrixAccountStorageRoot,
  resolveMatrixCredentialsDir,
  resolveMatrixCredentialsFilename,
  resolveMatrixCredentialsPath,
  resolveMatrixHomeserverKey,
  sanitizeMatrixPathSegment,
} from "./src/storage-paths.js";
export { ensureMatrixSdkInstalled, isMatrixSdkAvailable } from "./src/matrix/deps.js";
export {
  assertHttpUrlTargetsPrivateNetwork,
  closeDispatcher,
  createPinnedDispatcher,
  resolvePinnedHostnameWithPolicy,
  ssrfPolicyFromDangerouslyAllowPrivateNetwork,
  type LookupFn,
  type SsrFPolicy,
} from "mangabaclaw/plugin-sdk/ssrf-runtime";
export {
  setMatrixThreadBindingIdleTimeoutBySessionKey,
  setMatrixThreadBindingMaxAgeBySessionKey,
} from "./src/matrix/thread-bindings-shared.js";
export { setMatrixRuntime } from "./src/runtime.js";
export { writeJsonFileAtomically } from "mangabaclaw/plugin-sdk/json-store";
export type {
  ChannelDirectoryEntry,
  ChannelMessageActionContext,
} from "mangabaclaw/plugin-sdk/channel-contract";
export type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export { formatZonedTimestamp } from "mangabaclaw/plugin-sdk/time-runtime";
export type { PluginRuntime, RuntimeLogger } from "mangabaclaw/plugin-sdk/plugin-runtime";
export type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime-env";
export type { WizardPrompter } from "mangabaclaw/plugin-sdk/setup";

// This facade shipped distinct empty and whitespace behavior. Preserve that
// contract while delegating fractional limits to the progress-safe SDK owner.
export function chunkTextForOutbound(text: string, limit: number): string[] {
  if (text.length === 0) {
    return [""];
  }
  if (Number.isFinite(limit) && limit > 0 && !Number.isInteger(limit)) {
    return chunkTextForOutboundSdk(text, limit);
  }
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const splitAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const breakAt = splitAt > 0 ? splitAt : limit;
    chunks.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}
