// Slack API module exposes the plugin public contract.
export {
  buildComputedAccountStatusSnapshot,
  PAIRING_APPROVED_MESSAGE,
  projectCredentialSnapshotFields,
  resolveConfiguredFromRequiredCredentialStatuses,
} from "mangabaclaw/plugin-sdk/channel-status";
export { buildChannelConfigSchema, SlackConfigSchema } from "../config-api.js";
export type { ChannelMessageActionContext } from "mangabaclaw/plugin-sdk/channel-contract";
export { DEFAULT_ACCOUNT_ID } from "mangabaclaw/plugin-sdk/account-id";
export type {
  ChannelPlugin,
  MangabaClawPluginApi,
  PluginRuntime,
} from "mangabaclaw/plugin-sdk/channel-plugin-common";
export type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export type { SlackAccountConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export {
  emptyPluginConfigSchema,
  formatPairingApproveHint,
} from "mangabaclaw/plugin-sdk/channel-plugin-common";
export { loadOutboundMediaFromUrl } from "mangabaclaw/plugin-sdk/outbound-media";
export { looksLikeSlackTargetId, normalizeSlackMessagingTarget } from "./target-parsing.js";
export { getChatChannelMeta } from "./channel-api.js";
export {
  createActionGate,
  imageResultFromFile,
  jsonResult,
  readNumberParam,
  readPositiveIntegerParam,
  readReactionParams,
  readStringParam,
  withNormalizedTimestamp,
} from "mangabaclaw/plugin-sdk/channel-actions";
