// Shared config names let the build wrapper isolate the large unified DTS graph.
export const TSDOWN_PACKAGE_CONFIG_GROUP = "mangabaclaw-packages";
export const TSDOWN_UNIFIED_CONFIG_GROUP = "mangabaclaw-unified";
export const TSDOWN_UNIFIED_DTS_CONFIG_GROUPS = [
  "mangabaclaw-dts-base",
  "mangabaclaw-dts-plugin-sdk-1",
  "mangabaclaw-dts-plugin-sdk-2",
  "mangabaclaw-dts-extensions-1",
  "mangabaclaw-dts-extensions-2",
  "mangabaclaw-dts-extensions-3",
  "mangabaclaw-dts-extensions-4",
  "mangabaclaw-dts-extensions-5",
] as const;
