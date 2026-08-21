/**
 * Meta model catalog helpers derived from the plugin manifest.
 */
import { buildManifestModelDefinition } from "mangabaclaw/plugin-sdk/provider-catalog-shared";
import type { ModelDefinitionConfig } from "mangabaclaw/plugin-sdk/provider-model-shared";
import manifest from "./mangabaclaw.plugin.json" with { type: "json" };

const META_MANIFEST_CATALOG = manifest.modelCatalog.providers["meta"];

/** Base URL for Meta OpenAI-compatible inference. */
export const META_BASE_URL = META_MANIFEST_CATALOG.baseUrl;
/** Meta model catalog entries from the plugin manifest. */
export const META_MODEL_CATALOG = META_MANIFEST_CATALOG.models;

/** Builds normalized Meta catalog model definitions. */
export function buildMetaCatalogModels(): ModelDefinitionConfig[] {
  return META_MODEL_CATALOG.map(
    buildManifestModelDefinition({ providerId: "meta", catalog: META_MANIFEST_CATALOG }),
  );
}
