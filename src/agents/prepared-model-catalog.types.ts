import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import type { PluginMetadataSnapshot } from "../plugins/plugin-metadata-snapshot.types.js";
import type { PreparedAgentCredentialModes } from "./agent-auth-credential-modes.js";
import type { AuthProfileStore } from "./auth-profiles/types.js";
import type { ModelCatalogSnapshot } from "./model-catalog.types.js";

export type PublishedModelCatalogOwnerCandidate = Readonly<{
  agentId?: string;
  agentDir: string;
  workspaceDir?: string;
  config: MangabaClawConfig;
  authModes: PreparedAgentCredentialModes;
  authStore?: AuthProfileStore;
  metadataSnapshot: PluginMetadataSnapshot;
  modelCatalog: ModelCatalogSnapshot;
}>;

export type ResolvedPublishedModelCatalogOwner = Readonly<{
  agentId: string;
  agentDir: string;
  workspaceDir: string;
  config: MangabaClawConfig;
  authModes: PreparedAgentCredentialModes;
  authStore: AuthProfileStore;
  metadataSnapshot: PluginMetadataSnapshot;
  modelCatalog: ModelCatalogSnapshot;
}>;
