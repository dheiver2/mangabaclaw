import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import type { ModelProviderConfig } from "mangabaclaw/plugin-sdk/provider-model-shared";
import { LLAMA_CPP_PROVIDER_ID } from "./defaults.js";

export const MANAGED_LLAMA_CPP_CONFIG_REQUIRED_MESSAGE =
  "Local embeddings need the managed llama.cpp server config. Run `mangabaclaw configure`, choose llama.cpp once, then retry `mangabaclaw memory status --deep`.";

export function resolveManagedLlamaCppProviderConfig(config: MangabaClawConfig): ModelProviderConfig {
  const provider = config.models?.providers?.[LLAMA_CPP_PROVIDER_ID];
  if (!provider?.localService || !provider.baseUrl) {
    throw new Error(MANAGED_LLAMA_CPP_CONFIG_REQUIRED_MESSAGE);
  }
  return provider;
}
