import { describeAccountSnapshot } from "mangabaclaw/plugin-sdk/account-helpers";
import type { ChannelPlugin } from "mangabaclaw/plugin-sdk/channel-core";
import { BuzzConfigSchema } from "./config-schema.js";
import { buzzSetupContract } from "./setup-core.js";
import { buzzSetupWizard } from "./setup-surface.js";
import {
  listBuzzAccountIds,
  resolveBuzzAccount,
  resolveDefaultBuzzAccountId,
  type ResolvedBuzzAccount,
} from "./types.js";

export const buzzSetupPlugin: ChannelPlugin<ResolvedBuzzAccount> = {
  id: "buzz",
  meta: {
    id: "buzz",
    label: "Buzz",
    selectionLabel: "Buzz",
    docsPath: "/channels/buzz",
    docsLabel: "buzz",
    blurb: "Connect MangabaClaw agents to Buzz team rooms.",
    markdownCapable: true,
    order: 56,
  },
  capabilities: { chatTypes: ["group"], threads: true },
  reload: { configPrefixes: ["channels.buzz"] },
  configSchema: BuzzConfigSchema,
  setupContract: buzzSetupContract,
  setupWizard: buzzSetupWizard,
  config: {
    listAccountIds: listBuzzAccountIds,
    resolveAccount: (cfg, accountId) => resolveBuzzAccount({ cfg, accountId }),
    defaultAccountId: resolveDefaultBuzzAccountId,
    isConfigured: (account) => account.configured,
    describeAccount: (account) =>
      describeAccountSnapshot({
        account,
        configured: account.configured,
        extra: { baseUrl: account.relayUrl, publicKey: account.publicKey },
      }),
  },
};
