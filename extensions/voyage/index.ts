import { adaptMemoryEmbeddingProviderAdapter } from "mangabaclaw/plugin-sdk/memory-core-host-engine-embeddings";
// Voyage plugin entrypoint registers its MangabaClaw integration.
import { definePluginEntry } from "mangabaclaw/plugin-sdk/plugin-entry";
import { voyageMemoryEmbeddingProviderAdapter } from "./memory-embedding-adapter.js";

export default definePluginEntry({
  id: "voyage",
  name: "Voyage Embeddings",
  description: "Voyage memory embedding provider plugin",
  register(api) {
    api.registerEmbeddingProvider(
      adaptMemoryEmbeddingProviderAdapter(voyageMemoryEmbeddingProviderAdapter),
    );
  },
});
