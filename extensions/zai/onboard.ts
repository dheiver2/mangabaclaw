// Zai setup module handles plugin onboarding behavior.
import {
  applyProviderConfigWithModelCatalogPreset,
  type MangabaClawConfig,
} from "mangabaclaw/plugin-sdk/provider-onboard";
import { normalizeOptionalString } from "mangabaclaw/plugin-sdk/string-coerce-runtime";
import {
  buildZaiCatalogModels,
  resolveZaiBaseUrl,
  ZAI_CODING_CN_BASE_URL,
  ZAI_CODING_DEFAULT_MODEL_ID,
  ZAI_CODING_GLOBAL_BASE_URL,
  ZAI_DEFAULT_MODEL_ID,
} from "./model-definitions.js";

export const ZAI_DEFAULT_MODEL_REF = `zai/${ZAI_DEFAULT_MODEL_ID}`;

function resolveZaiPresetBaseUrl(cfg: MangabaClawConfig, endpoint?: string): string {
  const existingProvider = cfg.models?.providers?.zai;
  const existingBaseUrl = normalizeOptionalString(existingProvider?.baseUrl) ?? "";
  return endpoint ? resolveZaiBaseUrl(endpoint) : existingBaseUrl || resolveZaiBaseUrl();
}

export function resolveZaiModelId(params?: {
  endpoint?: string;
  modelId?: string;
  baseUrl?: string;
}): string {
  const explicitModelId = normalizeOptionalString(params?.modelId);
  if (explicitModelId) {
    return explicitModelId;
  }
  const baseUrl = normalizeOptionalString(params?.baseUrl)?.replace(/\/+$/, "");
  const usesCodingEndpoint =
    params?.endpoint?.startsWith("coding-") ||
    baseUrl === ZAI_CODING_GLOBAL_BASE_URL ||
    baseUrl === ZAI_CODING_CN_BASE_URL;
  return usesCodingEndpoint ? ZAI_CODING_DEFAULT_MODEL_ID : ZAI_DEFAULT_MODEL_ID;
}

function applyZaiPreset(
  cfg: MangabaClawConfig,
  params?: { endpoint?: string; modelId?: string },
  primaryModelRef?: string,
): MangabaClawConfig {
  const baseUrl = resolveZaiPresetBaseUrl(cfg, params?.endpoint);
  const modelId = resolveZaiModelId({ ...params, baseUrl });
  const modelRef = `zai/${modelId}`;
  return applyProviderConfigWithModelCatalogPreset(cfg, {
    providerId: "zai",
    api: "openai-completions",
    baseUrl,
    catalogModels: buildZaiCatalogModels(),
    aliases: [{ modelRef, alias: "GLM" }],
    primaryModelRef,
  });
}

export function applyZaiProviderConfig(
  cfg: MangabaClawConfig,
  params?: { endpoint?: string; modelId?: string },
): MangabaClawConfig {
  return applyZaiPreset(cfg, params);
}

export function applyZaiConfig(
  cfg: MangabaClawConfig,
  params?: { endpoint?: string; modelId?: string },
): MangabaClawConfig {
  const baseUrl = resolveZaiPresetBaseUrl(cfg, params?.endpoint);
  const modelId = resolveZaiModelId({ ...params, baseUrl });
  const modelRef = modelId === ZAI_DEFAULT_MODEL_ID ? ZAI_DEFAULT_MODEL_REF : `zai/${modelId}`;
  return applyZaiPreset(cfg, params, modelRef);
}
