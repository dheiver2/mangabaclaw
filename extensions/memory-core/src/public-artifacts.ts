// Memory Core plugin module implements public artifacts behavior.
import {
  listMemoryHostPublicArtifacts,
  type MemoryPluginPublicArtifact,
} from "mangabaclaw/plugin-sdk/memory-host-core";
import type { MangabaClawConfig } from "../api.js";

export async function listMemoryCorePublicArtifacts(params: {
  cfg: MangabaClawConfig;
}): Promise<MemoryPluginPublicArtifact[]> {
  return await listMemoryHostPublicArtifacts(params);
}
