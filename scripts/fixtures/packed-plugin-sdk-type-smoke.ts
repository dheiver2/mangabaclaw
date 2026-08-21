// Packed Plugin Sdk Type Smoke script supports MangabaClaw repository automation.
type PublicPluginSdkModules = [
  typeof import("mangabaclaw/plugin-sdk/core"),
  typeof import("mangabaclaw/plugin-sdk/channel-entry-contract"),
  typeof import("mangabaclaw/plugin-sdk/config-contracts"),
  typeof import("mangabaclaw/plugin-sdk/plugin-entry"),
  typeof import("mangabaclaw/plugin-sdk/runtime-env"),
];

const resolvedModules = null as unknown as PublicPluginSdkModules;

void resolvedModules;
