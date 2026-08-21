import type { ModelCatalogSnapshot } from "../agents/model-catalog.types.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";

export type GatewayModelCatalogSnapshot = ModelCatalogSnapshot & {
  agentId: string;
  agentDir: string;
  catalogComplete: boolean;
  workspaceDir: string;
  config: MangabaClawConfig;
};
