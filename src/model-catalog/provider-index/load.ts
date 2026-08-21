// Provider-index loader normalizes bundled installable-provider metadata and falls back to an empty index.
import { normalizeMangabaClawProviderIndex } from "./normalize.js";
import { MANGABACLAW_PROVIDER_INDEX } from "./mangabaclaw-provider-index.js";
import type { MangabaClawProviderIndex } from "./types.js";

// Load the bundled provider index through the normalizer. Invalid generated or
// caller-supplied data falls back to an empty v1 index instead of leaking shape.
export function loadMangabaClawProviderIndex(
  source: unknown = MANGABACLAW_PROVIDER_INDEX,
): MangabaClawProviderIndex {
  return normalizeMangabaClawProviderIndex(source) ?? { version: 1, providers: {} };
}
