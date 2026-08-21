import {
  buildManifestModelProviderConfig,
  readManifestProviderDefaultModelRef,
} from "mangabaclaw/plugin-sdk/provider-catalog-shared";
import type { ModelDefinitionConfig } from "mangabaclaw/plugin-sdk/provider-model-shared";
import manifest from "./mangabaclaw.plugin.json" with { type: "json" };

const MISTRAL_MANIFEST_CATALOG = manifest.modelCatalog.providers.mistral;

export const MISTRAL_BASE_URL = MISTRAL_MANIFEST_CATALOG.baseUrl;
export const MISTRAL_DEFAULT_MODEL_REF = readManifestProviderDefaultModelRef(manifest, "mistral")!;
export const MISTRAL_DEFAULT_MODEL_ID = MISTRAL_DEFAULT_MODEL_REF.slice("mistral/".length);

export function buildMistralModelDefinition(): ModelDefinitionConfig {
  const model = buildMistralCatalogModels().find((entry) => entry.id === MISTRAL_DEFAULT_MODEL_ID);
  if (!model) {
    throw new Error(`Missing Mistral provider model ${MISTRAL_DEFAULT_MODEL_ID}`);
  }
  return model;
}

function buildMistralCatalogModels(): ModelDefinitionConfig[] {
  return buildManifestModelProviderConfig({
    providerId: "mistral",
    catalog: MISTRAL_MANIFEST_CATALOG,
  }).models;
}
