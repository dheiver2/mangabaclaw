import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";

const DEFAULT_REMOTE_MODEL_CATALOG_URL = "https://catalog.openclaw.ai/models/v1/catalog.json";

export function isRemoteModelCatalogRefreshEnabled(config: MangabaClawConfig): boolean {
  return config.models?.catalogRefresh?.enabled !== false;
}

export function resolveRemoteCatalogUrl(config: MangabaClawConfig): string {
  return config.models?.catalogRefresh?.url?.trim() || DEFAULT_REMOTE_MODEL_CATALOG_URL;
}
