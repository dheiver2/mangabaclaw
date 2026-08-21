// Provider-index types describe install hints, auth choices, and preview catalogs for discoverable providers.
import type { ModelCatalogProvider } from "@mangabaclaw/model-catalog-core/model-catalog-types";

// Normalized provider-index schema. It describes providers discoverable before
// plugin install, including install hints, auth choices, and preview catalogs.
export type MangabaClawProviderIndexPluginInstall = {
  clawhubSpec?: string;
  npmSpec?: string;
  defaultChoice?: "clawhub" | "npm";
  minHostVersion?: string;
  expectedIntegrity?: string;
};

export type MangabaClawProviderIndexPlugin = {
  id: string;
  package?: string;
  source?: string;
  install?: MangabaClawProviderIndexPluginInstall;
};

export type MangabaClawProviderIndexProviderAuthChoice = {
  method: string;
  choiceId: string;
  choiceLabel: string;
  choiceHint?: string;
  assistantPriority?: number;
  assistantVisibility?: "visible" | "manual-only";
  groupId?: string;
  groupLabel?: string;
  groupHint?: string;
  optionKey?: string;
  cliFlag?: string;
  cliOption?: string;
  cliDescription?: string;
  onboardingScopes?: readonly ("text-inference" | "image-generation" | "music-generation")[];
};

export type MangabaClawProviderIndexProvider = {
  id: string;
  name: string;
  plugin: MangabaClawProviderIndexPlugin;
  docs?: string;
  categories?: readonly string[];
  authChoices?: readonly MangabaClawProviderIndexProviderAuthChoice[];
  previewCatalog?: ModelCatalogProvider;
};

export type MangabaClawProviderIndex = {
  version: number;
  providers: Readonly<Record<string, MangabaClawProviderIndexProvider>>;
};
