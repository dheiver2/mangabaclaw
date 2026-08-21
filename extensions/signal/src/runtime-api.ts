// Private runtime barrel for the bundled Signal extension.
// Prefer narrower SDK subpaths plus local extension seams over the legacy signal barrel.

import type { MangabaClawConfig as RuntimeMangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
export type { ChannelMessageActionAdapter } from "mangabaclaw/plugin-sdk/channel-contract";
export { buildChannelConfigSchema, SignalConfigSchema } from "../config-api.js";
export { PAIRING_APPROVED_MESSAGE } from "mangabaclaw/plugin-sdk/channel-status";
export type { RuntimeMangabaClawConfig as MangabaClawConfig };
export type { MangabaClawPluginApi, PluginRuntime } from "mangabaclaw/plugin-sdk/core";
export type { ChannelPlugin } from "mangabaclaw/plugin-sdk/core";
export {
  DEFAULT_ACCOUNT_ID,
  applyAccountNameToChannelSection,
  deleteAccountFromConfigSection,
  emptyPluginConfigSchema,
  formatPairingApproveHint,
  getChatChannelMeta,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
} from "mangabaclaw/plugin-sdk/core";
export { resolveChannelMediaMaxBytes } from "mangabaclaw/plugin-sdk/media-runtime";
export { formatCliCommand, formatDocsLink } from "mangabaclaw/plugin-sdk/setup-tools";
export { chunkText } from "mangabaclaw/plugin-sdk/reply-runtime";
export { detectBinary } from "mangabaclaw/plugin-sdk/setup-tools";
export {
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
} from "mangabaclaw/plugin-sdk/runtime-group-policy";
export {
  buildBaseAccountStatusSnapshot,
  buildBaseChannelStatusSummary,
  collectStatusIssuesFromLastError,
  createDefaultChannelRuntimeState,
} from "mangabaclaw/plugin-sdk/status-helpers";
export { normalizeE164 } from "mangabaclaw/plugin-sdk/text-utility-runtime";
export { looksLikeSignalTargetId, normalizeSignalMessagingTarget } from "./normalize.js";
export {
  listEnabledSignalAccounts,
  listSignalAccountIds,
  resolveDefaultSignalAccountId,
  resolveSignalAccount,
  resolveSignalTransport,
} from "./accounts.js";
export { monitorSignalProvider } from "./monitor.js";
export { installSignalCli } from "./install-signal-cli.js";
export { probeSignal } from "./probe.js";
export { resolveSignalReactionLevel } from "./reaction-level.js";
export { removeReactionSignal, sendReactionSignal } from "./send-reactions.js";
export { sendMessageSignal } from "./send.js";
export { signalMessageActions } from "./message-actions.js";
export type { ResolvedSignalAccount, ResolvedSignalTransport } from "./accounts.js";
export type { SignalAccountConfig, SignalTransportConfig } from "./account-types.js";
