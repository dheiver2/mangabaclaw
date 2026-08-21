/** Runtime resolver for plugin-contributed embedding providers. */
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { resolveConfiguredGenericEmbeddingProviderId } from "./embedding-provider-config.js";
import {
  getRuntimeEmbeddingProviderAdapter,
  listRuntimeEmbeddingProviderAdapters,
  resolveRuntimeEmbeddingProviderLookupIds,
} from "./embedding-provider-runtime-shared.js";
import {
  getRegisteredEmbeddingProvider,
  listRegisteredEmbeddingProviders,
  type EmbeddingProviderAdapter,
} from "./embedding-providers.js";

/** Lists embedding provider adapters registered directly with the process registry. */
function listRegisteredEmbeddingProviderAdapters(): EmbeddingProviderAdapter[] {
  return listRegisteredEmbeddingProviders().map((entry) => entry.adapter);
}

/** Lists embedding providers from registered adapters and plugin capabilities. */
export function listEmbeddingProviders(cfg?: MangabaClawConfig): EmbeddingProviderAdapter[] {
  return listRuntimeEmbeddingProviderAdapters({
    key: "embeddingProviders",
    cfg,
    registered: listRegisteredEmbeddingProviderAdapters(),
  });
}

function resolveConfiguredEmbeddingProviderId(
  providerId: string,
  cfg?: MangabaClawConfig,
): string | undefined {
  return resolveConfiguredGenericEmbeddingProviderId(providerId, cfg);
}

function resolveEmbeddingProviderLookupIds(id: string, cfg?: MangabaClawConfig): string[] {
  return resolveRuntimeEmbeddingProviderLookupIds({
    id,
    cfg,
    resolveConfiguredProviderId: resolveConfiguredEmbeddingProviderId,
  });
}

/** Resolves one embedding provider adapter by id, including configured API aliases. */
export function getEmbeddingProvider(
  id: string,
  cfg?: MangabaClawConfig,
): EmbeddingProviderAdapter | undefined {
  return getRuntimeEmbeddingProviderAdapter({
    key: "embeddingProviders",
    cfg,
    lookupIds: resolveEmbeddingProviderLookupIds(id, cfg),
    getRegisteredProvider: getRegisteredEmbeddingProvider,
  });
}
