/**
 * Cerebras model provider builder.
 */
import { buildManifestModelProviderConfig } from "mangabaclaw/plugin-sdk/provider-catalog-shared";
import type { ModelProviderConfig } from "mangabaclaw/plugin-sdk/provider-model-shared";
import manifest from "./mangabaclaw.plugin.json" with { type: "json" };

/** Builds the Cerebras OpenAI-compatible model provider config. */
export function buildCerebrasProvider(): ModelProviderConfig {
  return buildManifestModelProviderConfig({
    providerId: "cerebras",
    catalog: manifest.modelCatalog.providers.cerebras,
  });
}
