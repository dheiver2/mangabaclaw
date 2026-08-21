// Gmi plugin entrypoint registers its MangabaClaw integration.
import { readConfiguredProviderCatalogEntries } from "mangabaclaw/plugin-sdk/provider-catalog-shared";
import { defineSingleProviderPluginEntry } from "mangabaclaw/plugin-sdk/provider-entry";
import { buildProviderReplayFamilyHooks } from "mangabaclaw/plugin-sdk/provider-model-shared";
import { buildProviderToolCompatFamilyHooks } from "mangabaclaw/plugin-sdk/provider-tools";
import manifest from "./mangabaclaw.plugin.json" with { type: "json" };

const PROVIDER_ID = "gmi";

export default defineSingleProviderPluginEntry({
  id: PROVIDER_ID,
  name: "GMI Cloud Provider",
  description: "GMI Cloud provider plugin",
  manifest,
  provider: {
    label: "GMI Cloud",
    docsPath: "/providers/gmi",
    aliases: ["gmi-cloud", "gmicloud"],
    manifestAuth: {
      noteTitle: "GMI Cloud",
      noteMessage: "Manage API keys at https://www.gmicloud.ai/",
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
