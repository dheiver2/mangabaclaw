import { createSimpleChannelSecretContract } from "mangabaclaw/plugin-sdk/channel-secret-basic-runtime";

export const channelSecrets = createSimpleChannelSecretContract({
  channelKey: "buzz",
  label: "Buzz",
  accountFields: [],
  channelFields: ["privateKey", "authTag"],
  mode: "channel-surface",
});

export const { secretTargetRegistryEntries, collectRuntimeConfigAssignments } = channelSecrets;
