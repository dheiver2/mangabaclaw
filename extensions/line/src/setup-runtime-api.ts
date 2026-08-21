// Line API module exposes the plugin public contract.
export {
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  setSetupChannelEnabled,
  splitSetupEntries,
} from "mangabaclaw/plugin-sdk/setup";
export type { ChannelSetupWizard } from "mangabaclaw/plugin-sdk/setup";
export { listLineAccountIds, normalizeAccountId, resolveLineAccount } from "./accounts.js";
