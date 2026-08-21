import "./memory-runtime.js";

type MemoryRuntimeTestApi = {
  resetStandaloneMemoryRegistrySlot(): void;
};

export function resetStandaloneMemoryRegistrySlot(): void {
  const api = (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("mangabaclaw.memoryRuntimeTestApi")
  ] as MemoryRuntimeTestApi;
  api.resetStandaloneMemoryRegistrySlot();
}
