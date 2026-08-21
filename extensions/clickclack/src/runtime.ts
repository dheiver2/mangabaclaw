/**
 * Runtime store for host-provided MangabaClaw services used by the ClickClack
 * bundled plugin.
 */
import { createPluginRuntimeStore } from "mangabaclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "mangabaclaw/plugin-sdk/runtime-store";

const { setRuntime: setClickClackRuntime, getRuntime: getClickClackRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "clickclack",
    errorMessage: "ClickClack runtime not initialized",
  });

export { getClickClackRuntime, setClickClackRuntime };
