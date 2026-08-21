import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import type { AuthProfileStore } from "../auth-profiles/types.js";
import type { ToolModelConfig } from "./model-config.helpers.js";
import "./video-generate-tool.js";

type VideoGenerateToolTestApi = {
  resolveVideoGenerationModelConfigForTool(params: {
    cfg?: MangabaClawConfig;
    workspaceDir?: string;
    agentDir?: string;
    authStore?: AuthProfileStore;
  }): ToolModelConfig | null;
};

function getTestApi(): VideoGenerateToolTestApi {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("mangabaclaw.videoGenerateToolTestApi")
  ] as VideoGenerateToolTestApi;
}

export const resolveVideoGenerationModelConfigForTool: VideoGenerateToolTestApi["resolveVideoGenerationModelConfigForTool"] =
  (params) => getTestApi().resolveVideoGenerationModelConfigForTool(params);
