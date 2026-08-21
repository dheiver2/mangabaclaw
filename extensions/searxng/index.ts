// Searxng plugin entrypoint registers its MangabaClaw integration.
import { definePluginEntry } from "mangabaclaw/plugin-sdk/plugin-entry";
import { createSearxngWebSearchProvider } from "./src/searxng-search-provider.js";

export default definePluginEntry({
  id: "searxng",
  name: "SearXNG Plugin",
  description: "Bundled SearXNG web search plugin",
  register(api) {
    api.registerWebSearchProvider(createSearxngWebSearchProvider());
  },
});
