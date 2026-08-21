// LongCat plugin entrypoint registers its MangabaClaw integration.
import { defineSingleProviderPluginEntry } from "mangabaclaw/plugin-sdk/provider-entry";
import { buildProviderReplayFamilyHooks } from "mangabaclaw/plugin-sdk/provider-model-shared";
import { buildProviderToolCompatFamilyHooks } from "mangabaclaw/plugin-sdk/provider-tools";
import { LONGCAT_DEFAULT_MODEL_REF } from "./models.js";
import { applyLongCatConfig } from "./onboard.js";
import manifest from "./mangabaclaw.plugin.json" with { type: "json" };
import { createLongCatThinkingWrapper } from "./stream.js";

const PROVIDER_ID = "longcat";

export default defineSingleProviderPluginEntry({
  id: PROVIDER_ID,
  name: "LongCat Provider",
  description: "Official LongCat provider plugin",
  manifest,
  provider: {
    label: "LongCat",
    docsPath: "/providers/longcat",
    aliases: ["meituan-longcat"],
    manifestAuth: {
      defaultModel: LONGCAT_DEFAULT_MODEL_REF,
      applyConfig: applyLongCatConfig,
      noteTitle: "LongCat",
      noteMessage: "Manage API keys at https://longcat.chat/platform/api_keys",
    },
    catalog: { liveModelDiscovery: true },
    ...buildProviderReplayFamilyHooks({
      family: "openai-compatible",
      dropReasoningFromHistory: false,
    }),
    ...buildProviderToolCompatFamilyHooks("openai"),
    wrapStreamFn: (ctx) => createLongCatThinkingWrapper(ctx.streamFn, ctx.thinkingLevel),
  },
});
