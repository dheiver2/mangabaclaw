// Matrix plugin module implements monitor route test support behavior.
export {
  registerSessionBindingAdapter,
  testing,
} from "mangabaclaw/plugin-sdk/session-binding-runtime";
export { resolveAgentRoute } from "mangabaclaw/plugin-sdk/routing";
export {
  createTestRegistry,
  setActivePluginRegistry,
} from "mangabaclaw/plugin-sdk/plugin-test-runtime";
export type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
