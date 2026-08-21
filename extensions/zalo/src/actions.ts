// Zalo plugin module implements actions behavior.
import { jsonResult, readStringParam } from "mangabaclaw/plugin-sdk/channel-actions";
import type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
} from "mangabaclaw/plugin-sdk/channel-contract";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { createLazyRuntimeNamedExport } from "mangabaclaw/plugin-sdk/lazy-runtime";
import { extractToolSend } from "mangabaclaw/plugin-sdk/tool-send";
import { inspectZaloAccount, listZaloAccountIds } from "./accounts.js";

const loadZaloActionsRuntime = createLazyRuntimeNamedExport(
  () => import("./actions.runtime.js"),
  "zaloActionsRuntime",
);

const providerId = "zalo";
const ZALO_ACTIONS = new Set<ChannelMessageActionName>(["send"]);

function listEnabledAccounts(cfg: MangabaClawConfig, accountId?: string | null) {
  return (
    accountId
      ? [inspectZaloAccount({ cfg, accountId })]
      : listZaloAccountIds(cfg).map((listedAccountId) =>
          inspectZaloAccount({ cfg, accountId: listedAccountId }),
        )
  ).filter((account) => account.enabled && account.tokenStatus === "available");
}

export const zaloMessageActions: ChannelMessageActionAdapter = {
  describeMessageTool: ({ cfg, accountId }) => {
    const accounts = listEnabledAccounts(cfg, accountId);
    if (accounts.length === 0) {
      return null;
    }
    return { actions: Array.from(ZALO_ACTIONS), capabilities: [] };
  },
  supportsAction: ({ action }) => ZALO_ACTIONS.has(action),
  extractToolSend: ({ args }) => extractToolSend(args, "sendMessage"),
  handleAction: async ({ action, params, cfg, accountId }) => {
    if (action === "send") {
      const to = readStringParam(params, "to", { required: true });
      const content = readStringParam(params, "message", {
        required: true,
        allowEmpty: true,
      });
      const mediaUrl = readStringParam(params, "media", { trim: false });

      const { sendMessageZalo } = await loadZaloActionsRuntime();
      const result = await sendMessageZalo(to ?? "", content ?? "", {
        accountId: accountId ?? undefined,
        mediaUrl: mediaUrl ?? undefined,
        cfg,
      });

      if (!result.ok) {
        return jsonResult({
          ok: false,
          error: result.error ?? "Failed to send Zalo message",
        });
      }

      return jsonResult({ ok: true, to, messageId: result.messageId });
    }

    throw new Error(`Action ${action} is not supported for provider ${providerId}.`);
  },
};
