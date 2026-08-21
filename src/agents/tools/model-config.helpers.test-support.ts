import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import type { AuthProfileStore } from "../auth-profiles/types.js";
import "./model-config.helpers.js";

type ModelConfigHelpersTestApi = {
  hasDirectProviderApiKeyAuthForTool(params: {
    provider: string;
    cfg?: MangabaClawConfig;
    workspaceDir?: string;
    agentDir?: string;
    authStore?: AuthProfileStore;
    modelApi?: string;
  }): boolean;
};

function getTestApi(): ModelConfigHelpersTestApi {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("mangabaclaw.modelConfigHelpersTestApi")
  ] as ModelConfigHelpersTestApi;
}

export const hasDirectProviderApiKeyAuthForTool: ModelConfigHelpersTestApi["hasDirectProviderApiKeyAuthForTool"] =
  (params) => getTestApi().hasDirectProviderApiKeyAuthForTool(params);
