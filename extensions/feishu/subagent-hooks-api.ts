// Feishu API module exposes the plugin public contract.
import type { MangabaClawPluginApi } from "mangabaclaw/plugin-sdk/channel-entry-contract";
import { createLazyRuntimeModule } from "mangabaclaw/plugin-sdk/lazy-runtime";

const loadFeishuSubagentHooksModule = createLazyRuntimeModule(
  () => import("./src/subagent-hooks.js"),
);

export function registerFeishuSubagentHooks(api: MangabaClawPluginApi): void {
  api.on("subagent_delivery_target", async (event) => {
    const { handleFeishuSubagentDeliveryTarget } = await loadFeishuSubagentHooksModule();
    return handleFeishuSubagentDeliveryTarget(event);
  });
  api.on("subagent_ended", async (event) => {
    const { handleFeishuSubagentEnded } = await loadFeishuSubagentHooksModule();
    handleFeishuSubagentEnded(event);
  });
}
