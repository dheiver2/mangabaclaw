type FallbackSkipCacheState = {
  buckets: Map<string, Map<string, unknown>>;
  lastGlobalPruneAtMs: number;
};

function getFallbackSkipCacheGlobals() {
  return globalThis as typeof globalThis & {
    mangabaclawFallbackSkipCache?: Map<string, Map<string, unknown>>;
    mangabaclawFallbackSkipCacheState?: FallbackSkipCacheState;
  };
}

export function resetFallbackSkipCacheForTest(): void {
  const globals = getFallbackSkipCacheGlobals();
  globals.mangabaclawFallbackSkipCache?.clear();
  globals.mangabaclawFallbackSkipCacheState?.buckets.clear();
  if (globals.mangabaclawFallbackSkipCacheState) {
    globals.mangabaclawFallbackSkipCacheState.lastGlobalPruneAtMs = 0;
  }
}

export function listFallbackSkipCacheSessionIdsForTest(): string[] {
  const globals = getFallbackSkipCacheGlobals();
  return [...(globals.mangabaclawFallbackSkipCacheState?.buckets.keys() ?? [])];
}
