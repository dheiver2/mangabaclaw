// Kilocode provider module implements model/runtime integration.
import { buildManifestModelProviderConfig } from "mangabaclaw/plugin-sdk/provider-catalog-shared";
import type { ModelProviderConfig } from "mangabaclaw/plugin-sdk/provider-model-shared";
import manifest from "./mangabaclaw.plugin.json" with { type: "json" };
import {
  discoverKilocodeModels,
  KILOCODE_BASE_URL as LOCAL_KILOCODE_BASE_URL,
} from "./provider-models.js";

export function buildKilocodeProvider(): ModelProviderConfig {
  return buildManifestModelProviderConfig({
    providerId: "kilocode",
    catalog: manifest.modelCatalog.providers.kilocode,
  });
}

export async function buildKilocodeProviderWithDiscovery(): Promise<ModelProviderConfig> {
  const models = await discoverKilocodeModels();
  return {
    baseUrl: LOCAL_KILOCODE_BASE_URL,
    api: "openai-completions",
    models,
  };
}
