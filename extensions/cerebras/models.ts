/**
 * Cerebras model catalog helpers derived from the plugin manifest.
 */
import { buildManifestModelDefinition } from "mangabaclaw/plugin-sdk/provider-catalog-shared";
import type { ModelDefinitionConfig } from "mangabaclaw/plugin-sdk/provider-model-shared";
import manifest from "./mangabaclaw.plugin.json" with { type: "json" };

const CEREBRAS_MANIFEST_CATALOG = manifest.modelCatalog.providers.cerebras;

/** Base URL for Cerebras OpenAI-compatible inference. */
export const CEREBRAS_BASE_URL = CEREBRAS_MANIFEST_CATALOG.baseUrl;
/** Cerebras model catalog entries from the plugin manifest. */
export const CEREBRAS_MODEL_CATALOG = CEREBRAS_MANIFEST_CATALOG.models;

/** Builds normalized Cerebras catalog model definitions. */
export function buildCerebrasCatalogModels(): ModelDefinitionConfig[] {
  return CEREBRAS_MODEL_CATALOG.map(
    buildManifestModelDefinition({ providerId: "cerebras", catalog: CEREBRAS_MANIFEST_CATALOG }),
  );
}
