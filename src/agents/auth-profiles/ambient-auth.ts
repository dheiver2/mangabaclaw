/** Provider auth-pin policy for credentials discovered outside MangabaClaw storage. */
import { findNormalizedProviderValue } from "@mangabaclaw/model-catalog-core/provider-id";
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import {
  type ProviderAuthAliasLookupParams,
  resolveProviderIdForAuth,
} from "../provider-auth-aliases.js";
import type { AuthProfileCredential } from "./types.js";

/** Returns whether ambient credential material agrees with a provider's declared auth mode. */
export function isAmbientCredentialAllowedByProviderAuthPin(params: {
  config?: MangabaClawConfig;
  authAliasLookupParams?: Omit<ProviderAuthAliasLookupParams, "config">;
  provider: string;
  type: AuthProfileCredential["type"];
}): boolean {
  const providers = params.config?.models?.providers;
  const direct = findNormalizedProviderValue(providers, params.provider);
  const providerAuthKey = resolveProviderIdForAuth(params.provider, {
    config: params.config,
    ...params.authAliasLookupParams,
  });
  const auth = direct?.auth ?? findNormalizedProviderValue(providers, providerAuthKey)?.auth;
  if (auth === "api-key") {
    return params.type === "api_key";
  }
  if (auth === "oauth") {
    return params.type === "oauth" || params.type === "token";
  }
  if (auth === "token") {
    return params.type === "token";
  }
  return auth === undefined;
}
