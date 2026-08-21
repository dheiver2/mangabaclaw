/**
 * Browser test-support re-exports from shared plugin-sdk test fixtures.
 */
export {
  createCliRuntimeCapture,
  expectGeneratedTokenPersistedToGatewayAuth,
  type CliRuntimeCapture,
} from "mangabaclaw/plugin-sdk/test-fixtures";
export { createTempHomeEnv, useAutoCleanupTempDirTracker } from "mangabaclaw/plugin-sdk/test-env";
export type { TempHomeEnv } from "mangabaclaw/plugin-sdk/test-env";
export { isLiveTestEnabled } from "mangabaclaw/plugin-sdk/test-live";
export type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
