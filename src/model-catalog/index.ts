// Public model-catalog facade. Keep exports here curated so callers use the
// normalized planning APIs instead of reaching into provider-index internals.
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import {
  planManifestModelCatalogRows,
  type ManifestModelCatalogRowSelection,
} from "./manifest-planner.js";
import { getRemoteModelCatalogProviderOverlay } from "./remote-overlay.js";
export { loadMangabaClawProviderIndex } from "./provider-index/index.js";
export { planManifestModelCatalogSuppressions } from "./manifest-planner.js";

export function planEffectiveModelCatalogRows(params: {
  registry: Parameters<typeof planManifestModelCatalogRows>[0]["registry"];
  config: MangabaClawConfig;
  providerFilter?: string;
  providerFilters?: readonly string[];
  mergeKeyFilter?: ReadonlySet<string>;
  selection?: ManifestModelCatalogRowSelection;
}) {
  return planManifestModelCatalogRows({
    registry: params.registry,
    ...(params.providerFilter ? { providerFilter: params.providerFilter } : {}),
    ...(params.providerFilters ? { providerFilters: params.providerFilters } : {}),
    ...(params.mergeKeyFilter ? { mergeKeyFilter: params.mergeKeyFilter } : {}),
    resolveRemoteProvider: (provider) =>
      getRemoteModelCatalogProviderOverlay(params.config, provider),
    ...(params.selection ? { selection: params.selection } : {}),
  });
}
export type { ManifestModelCatalogSuppressionEntry } from "./manifest-planner.js";
export type { MangabaClawProviderIndexProvider } from "./provider-index/index.js";
