// Slack plugin module implements runtime behavior.
import type { PluginRuntime } from "mangabaclaw/plugin-sdk/channel-core";
import { createPluginRuntimeStore } from "mangabaclaw/plugin-sdk/runtime-store";

type SlackChannelRuntime = {
  handleSlackAction?: typeof import("./action-runtime.js").handleSlackAction;
};

type SlackRuntime = PluginRuntime & {
  channel: PluginRuntime["channel"] & {
    slack?: SlackChannelRuntime;
  };
};

const {
  setRuntime: setSlackRuntime,
  tryGetRuntime: getOptionalSlackRuntime,
  getRuntime: getSlackRuntime,
} = createPluginRuntimeStore<SlackRuntime>({
  pluginId: "slack",
  errorMessage: "Slack runtime not initialized",
});
export { getOptionalSlackRuntime, getSlackRuntime, setSlackRuntime };
