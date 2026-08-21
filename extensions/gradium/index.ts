// Gradium plugin entrypoint registers its MangabaClaw integration.
import { definePluginEntry } from "mangabaclaw/plugin-sdk/plugin-entry";
import { buildGradiumSpeechProvider } from "./speech-provider.js";

export default definePluginEntry({
  id: "gradium",
  name: "Gradium Speech",
  description: "Bundled Gradium speech provider",
  register(api) {
    api.registerSpeechProvider(buildGradiumSpeechProvider());
  },
});
