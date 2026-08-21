// Mattermost plugin module implements secret input behavior.
export type { SecretInput } from "mangabaclaw/plugin-sdk/secret-input";
export {
  buildSecretInputSchema,
  hasConfiguredSecretInput,
  resolveSecretInputString,
} from "mangabaclaw/plugin-sdk/secret-input";
export type { SecretInputStringResolutionMode } from "mangabaclaw/plugin-sdk/secret-input";
