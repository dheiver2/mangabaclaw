// Memory Host SDK resolves the sole builtin backend and citation mode.
import type { MemoryCitationsMode, MangabaClawConfig } from "./config-utils.js";

export type ResolvedMemoryBackendConfig = {
  backend: "builtin";
  citations: MemoryCitationsMode;
};

const DEFAULT_CITATIONS: MemoryCitationsMode = "auto";

export function resolveMemoryBackendConfig(params: {
  cfg: MangabaClawConfig;
  agentId: string;
}): ResolvedMemoryBackendConfig {
  return {
    backend: "builtin",
    citations: params.cfg.memory?.citations ?? DEFAULT_CITATIONS,
  };
}
