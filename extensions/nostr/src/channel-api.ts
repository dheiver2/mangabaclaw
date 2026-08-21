// Nostr API module exposes the plugin public contract.
export {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  formatPairingApproveHint,
  type ChannelPlugin,
} from "mangabaclaw/plugin-sdk/channel-plugin-common";
export type { ChannelOutboundAdapter } from "mangabaclaw/plugin-sdk/channel-contract";
export {
  collectStatusIssuesFromLastError,
  createDefaultChannelRuntimeState,
} from "mangabaclaw/plugin-sdk/status-helpers";
