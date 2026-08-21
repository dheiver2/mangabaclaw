// Together plugin module implements models behavior.
import { buildManifestModelDefinition } from "mangabaclaw/plugin-sdk/provider-catalog-shared";
import type { ModelDefinitionConfig } from "mangabaclaw/plugin-sdk/provider-model-shared";
import manifest from "./mangabaclaw.plugin.json" with { type: "json" };

const TOGETHER_MANIFEST_CATALOG = manifest.modelCatalog.providers.together;
export const TOGETHER_BASE_URL = TOGETHER_MANIFEST_CATALOG.baseUrl;

export const TOGETHER_MODEL_CATALOG: ModelDefinitionConfig[] = TOGETHER_MANIFEST_CATALOG.models.map(
  buildManifestModelDefinition({
    providerId: "together",
    catalog: TOGETHER_MANIFEST_CATALOG,
    decorate: (model) => ({ ...model, api: "openai-completions" }),
  }),
);
