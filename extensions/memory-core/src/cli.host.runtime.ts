// Memory Core plugin module implements cli.host behavior.
export {
  defaultRuntime,
  formatErrorMessage,
  resolveCommandSecretRefsViaGateway,
  setVerbose,
  shortenHomeInString,
  shortenHomePath,
  theme,
  withManager,
  withProgress,
  withProgressTotals,
} from "mangabaclaw/plugin-sdk/memory-core-host-runtime-cli";
export {
  getRuntimeConfig,
  resolveDefaultAgentId,
  type MangabaClawConfig,
} from "mangabaclaw/plugin-sdk/memory-core-host-runtime-core";
export { getMemorySearchManager } from "./memory/index.js";
