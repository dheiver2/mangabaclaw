// Novita plugin entrypoint registers its MangabaClaw integration.
import { readConfiguredProviderCatalogEntries } from "mangabaclaw/plugin-sdk/provider-catalog-shared";
import { defineSingleProviderPluginEntry } from "mangabaclaw/plugin-sdk/provider-entry";
import { buildProviderReplayFamilyHooks } from "mangabaclaw/plugin-sdk/provider-model-shared";
import { buildProviderToolCompatFamilyHooks } from "mangabaclaw/plugin-sdk/provider-tools";
import manifest from "./mangabaclaw.plugin.json" with { type: "json" };

const PROVIDER_ID = "novita";

export default defineSingleProviderPluginEntry({
  id: PROVIDER_ID,
  name: "NovitaAI Provider",
  description: "Official MangabaClaw NovitaAI provider plugin",
  manifest,
  provider: {
    label: "NovitaAI",
    docsPath: "/providers/novita",
    aliases: ["novita-ai", "novitaai"],
    manifestAuth: {
      noteTitle: "NovitaAI",
      noteMessage: "Manage API keys at https://novita.ai/settings/key-management",
    },
    catalog: {
      allowExplicitBaseUrl: true,
      liveModelDiscovery: true,
    },
    augmentModelCatalog: ({ config }) =>
      readConfiguredProviderCatalogEntries({
        config,
        providerId: PROVIDER_ID,
      }),
    ...buildProviderReplayFamilyHooks({
      family: "openai-compatible",
      dropReasoningFromHistory: false,
    }),
    ...buildProviderToolCompatFamilyHooks("openai"),
  },
});
