/** Adapts the shared configured-model projection to CLI provider aliases. */
import { resolveConfiguredModelEntries } from "../../agents/configured-model-entries.js";
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import type { PluginMetadataSnapshot } from "../../plugins/plugin-metadata-snapshot.js";
import { createModelCatalogProviderAliasCanonicalizer } from "./provider-aliases.js";

const DISPLAY_MODEL_PARSE_OPTIONS = { allowPluginNormalization: false } as const;

export function resolveConfiguredEntries(
  cfg: MangabaClawConfig,
  metadataSnapshot?: Pick<PluginMetadataSnapshot, "manifestRegistry">,
  agentId?: string,
) {
  const canonicalizer = createModelCatalogProviderAliasCanonicalizer({ cfg, metadataSnapshot });
  return resolveConfiguredModelEntries({
    cfg,
    agentId,
    ...DISPLAY_MODEL_PARSE_OPTIONS,
    canonicalizeRef: canonicalizer.ref,
  });
}
