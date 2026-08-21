// Shared setup wizard/types/helpers for plugin and channel setup surfaces.

export type { MangabaClawConfig } from "../config/config.js";
export type { DmPolicy } from "../config/types.js";
// Registry readers (2026-07-22): @nodeskai/feishu, mangabaclaw-channel-whatsapp-official,
// mangabaclaw-vk, mangabaclaw-ndr, moltbot-channel-feishu, @kagura-agent/mangabaclaw-zulip,
// @jeik/dingtalk-connector, @xzq-xu/feishu, @dingtalk-real-ai/dingtalk-connector,
// @mangabaclaw-vk/vk, yzw-dingtalk-connector, and mangabaclaw-channel-zulip.
export type { GroupPolicy } from "../config/types.js";
export type { SecretInput } from "../config/types.secrets.js";
export type {
  WizardMultiSelectParams,
  WizardProgress,
  WizardPrompter,
  // Registry reader (2026-07-22): @ama2/mangabaclaw-channel.
  WizardSelectParams,
} from "../wizard/prompts.js";
export { WizardCancelledError } from "../wizard/prompts.js";
export { createSetupTranslator } from "../wizard/i18n/index.js";
export type { ChannelSetupAdapter } from "../channels/plugins/types.adapters.js";
export type { ChannelSetupInput } from "../channels/plugins/types.core.js";
export type {
  ChannelSetupDmPolicy,
  ChannelSetupWizardAdapter,
  ChannelSetupWizard,
} from "../channels/plugins/setup-wizard-types.js";

export { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";
export { formatCliCommand } from "../cli/command-format.js";
export { detectBinary } from "../infra/detect-binary.js";
export { formatDocsLink } from "../../packages/terminal-core/src/links.js";
export { hasConfiguredSecretInput, normalizeSecretInputString } from "../config/types.secrets.js";
// Registry readers (2026-07-22): @cyzlmh/mangabaclaw-sms, @spicerhome/claw-messenger,
// @chatu-ai/webhub, @rowger_go/chatu, and @emotion-machine/claw-messenger.
export { normalizeE164 } from "../utils.js";
// Registry readers (2026-07-22): mangabaclaw-rcs, @woowonjae/rol-websocket-channel,
// mangabaclaw-swarm-layer, rol-websocket-channel, @clawling/clawchat-plugin-mangabaclaw,
// @workclaw/mangabaclaw-workclaw, clawspec, and @privateclaw/privateclaw.
export { pathExists } from "../utils.js";

export {
  moveSingleAccountChannelSectionToDefaultAccount,
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  createSetupInputPresenceValidator,
  createPatchedAccountSetupAdapter,
  migrateBaseNameToDefaultAccount,
  patchScopedAccountConfig,
  prepareScopedSetupConfig,
} from "../channels/plugins/setup-helpers.js";
export {
  addWildcardAllowFrom,
  buildSingleChannelSecretPromptState,
  // Registry reader (2026-07-22): @lansenger-pm/mangabaclaw-lansenger-channel.
  createAccountScopedAllowFromSection,
  createAllowFromSection,
  createPromptParsedAllowFromForAccount,
  createStandardChannelSetupStatus,
  createTopLevelChannelAllowFromSetter,
  createTopLevelChannelDmPolicy,
  createTopLevelChannelDmPolicySetter,
  createTopLevelChannelGroupPolicySetter,
  createTopLevelChannelParsedAllowFromPrompt,
  mergeAllowFromEntries,
  normalizeAllowFromEntries,
  parseSetupEntriesWithParser,
  patchTopLevelChannelConfigSection,
  patchChannelConfigForAccount,
  promptAccountId,
  promptSingleChannelSecretInput,
  // Registry reader (2026-07-22): mangabaclaw-channel-xiaozhu.
  resolveSetupAccountId,
  runSingleChannelSecretStep,
  setSetupChannelEnabled,
  // Registry readers (2026-07-22): mangabaclaw-vk and @mangabaclaw-vk/vk.
  setTopLevelChannelDmPolicyWithAllowFrom,
  splitSetupEntries,
} from "../channels/plugins/setup-wizard-helpers.js";
export { promptChannelAccessConfig } from "../channels/plugins/setup-group-access.js";
export { createDelegatedSetupWizardProxy } from "../channels/plugins/setup-wizard-proxy.js";
export { createDetectedBinaryStatus } from "../channels/plugins/setup-wizard-binary.js";

export { formatResolvedUnresolvedNote } from "./resolution-notes.js";
export { baseUrlTextInput, defineTokenCredential } from "./setup-credential.js";
