// Telegram plugin module implements sticker vision behavior.
import {
  findModelInCatalog,
  loadPreparedModelCatalog,
  modelSupportsVision,
  resolveAgentDir,
  resolveDefaultModelForAgent,
} from "mangabaclaw/plugin-sdk/agent-runtime";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";

export async function resolveStickerVisionSupportRuntime(params: {
  cfg: MangabaClawConfig;
  agentId?: string;
}): Promise<boolean> {
  const catalog = await loadPreparedModelCatalog({
    config: params.cfg,
    ...(params.agentId
      ? {
          agentId: params.agentId,
          agentDir: resolveAgentDir(params.cfg, params.agentId),
        }
      : {}),
    readOnly: true,
  });
  const defaultModel = resolveDefaultModelForAgent({
    cfg: params.cfg,
    agentId: params.agentId,
  });
  const entry = findModelInCatalog(catalog, defaultModel.provider, defaultModel.model);
  if (!entry) {
    return false;
  }
  return modelSupportsVision(entry);
}
