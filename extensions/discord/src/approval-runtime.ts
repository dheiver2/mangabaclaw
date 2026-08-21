// Discord plugin module implements approval runtime behavior.
export {
  isChannelExecApprovalClientEnabledFromConfig,
  matchesApprovalRequestFilters,
  getExecApprovalReplyMetadata,
} from "mangabaclaw/plugin-sdk/approval-client-runtime";
export { resolveApprovalApprovers } from "mangabaclaw/plugin-sdk/approval-auth-runtime";
export { createApproverRestrictedNativeApprovalCapability } from "mangabaclaw/plugin-sdk/approval-delivery-runtime";
export {
  createChannelApproverDmTargetResolver,
  createChannelNativeOriginTargetResolver,
} from "mangabaclaw/plugin-sdk/approval-native-runtime";
