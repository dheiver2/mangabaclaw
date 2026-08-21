// Memory Host SDK module implements embeddings remote client behavior.
import { normalizeOptionalString } from "@mangabaclaw/normalization-core/string-coerce";
import type { EmbeddingProviderOptions } from "./embeddings.types.js";
import { requireApiKey, resolveApiKeyForProvider } from "./mangabaclaw-runtime-auth.js";
import type { SsrFPolicy } from "./mangabaclaw-runtime-network.js";
import { buildRemoteBaseUrlPolicy } from "./remote-http.js";
import { resolveMemorySecretInputString } from "./secret-input.js";

// Builds authenticated remote embedding HTTP clients from agent memory config.

/** Provider id used for remote embedding auth and config lookup. */
export type RemoteEmbeddingProviderId = string;

/** Attribution headers for native OpenAI embedding calls. */
function resolveMangabaClawAttributionHeaders(): Record<string, string> {
  const version = typeof process !== "undefined" ? process.env.MANGABACLAW_VERSION?.trim() : undefined;
  return {
    originator: "mangabaclaw",
    ...(version ? { version } : {}),
    "User-Agent": version ? `mangabaclaw/${version}` : "mangabaclaw",
  };
}

/** Detect the native OpenAI embeddings API route that accepts attribution headers. */
function isNativeOpenAIEmbeddingRoute(provider: string, baseUrl: string): boolean {
  if (provider !== "openai") {
    return false;
  }
  try {
    return new URL(baseUrl).hostname.toLowerCase().replace(/\.+$/, "") === "api.openai.com";
  } catch {
    return false;
  }
}

/** Resolve base URL, bearer headers, header overrides, and SSRF policy for remote embeddings. */
export async function resolveRemoteEmbeddingBearerClient(params: {
  provider: RemoteEmbeddingProviderId;
  options: EmbeddingProviderOptions;
  defaultBaseUrl: string;
}): Promise<{ baseUrl: string; headers: Record<string, string>; ssrfPolicy?: SsrFPolicy }> {
  const remote = params.options.remote;
  const remoteApiKey = resolveMemorySecretInputString({
    value: remote?.apiKey,
    path: "memory.search.remote.apiKey",
  });
  const remoteBaseUrl = normalizeOptionalString(remote?.baseUrl);
  const providerConfig = params.options.config.models?.providers?.[params.provider];
  const apiKey = remoteApiKey
    ? remoteApiKey
    : requireApiKey(
        await resolveApiKeyForProvider({
          provider: params.provider,
          cfg: params.options.config,
          agentDir: params.options.agentDir,
        }),
        params.provider,
      );
  const baseUrl =
    remoteBaseUrl || normalizeOptionalString(providerConfig?.baseUrl) || params.defaultBaseUrl;
  const headerOverrides = Object.assign({}, providerConfig?.headers, remote?.headers);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...headerOverrides,
  };
  if (isNativeOpenAIEmbeddingRoute(params.provider, baseUrl)) {
    Object.assign(headers, resolveMangabaClawAttributionHeaders());
  }
  return { baseUrl, headers, ssrfPolicy: buildRemoteBaseUrlPolicy(baseUrl) };
}
