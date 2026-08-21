// Feishu plugin module implements approval auth behavior.
import { createChannelApprovalAuth } from "mangabaclaw/plugin-sdk/approval-auth-runtime";
import { normalizeOptionalLowercaseString } from "mangabaclaw/plugin-sdk/string-coerce-runtime";
import { resolveFeishuAccount } from "./accounts.js";
import { normalizeFeishuTarget } from "./targets.js";

function normalizeFeishuApproverId(value: string | number): string | undefined {
  const normalized = normalizeFeishuTarget(String(value));
  const trimmed = normalizeOptionalLowercaseString(normalized);
  return trimmed?.startsWith("ou_") ? trimmed : undefined;
}

export const feishuApprovalAuth = createChannelApprovalAuth({
  channelLabel: "Feishu",
  resolveInputs: ({ cfg, accountId }) => {
    const account = resolveFeishuAccount({ cfg, accountId }).config;
    return { allowFrom: account.allowFrom };
  },
  normalizeApprover: normalizeFeishuApproverId,
}).approvalAuth;
