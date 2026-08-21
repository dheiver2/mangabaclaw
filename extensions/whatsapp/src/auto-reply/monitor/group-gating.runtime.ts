// Whatsapp plugin module implements group gating behavior.
export {
  implicitMentionKindWhen,
  resolveInboundMentionDecision,
} from "mangabaclaw/plugin-sdk/channel-mention-gating";
export { hasControlCommand } from "mangabaclaw/plugin-sdk/command-detection";
export { createChannelHistoryWindow } from "mangabaclaw/plugin-sdk/reply-history";
export { parseActivationCommand } from "mangabaclaw/plugin-sdk/group-activation";
export { normalizeE164 } from "../../text-runtime.js";
