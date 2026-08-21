// Discord plugin module implements rest fetch behavior.
import { randomUUID } from "node:crypto";
import { formatErrorMessage } from "mangabaclaw/plugin-sdk/error-runtime";
import {
  createHttp1EnvHttpProxyAgent,
  createHttp1ProxyAgent,
  resolveEnvHttpProxyAgentOptions,
  wrapFetchWithAbortSignal,
} from "mangabaclaw/plugin-sdk/fetch-runtime";
import {
  captureHttpExchange,
  resolveEffectiveDebugProxyUrl,
} from "mangabaclaw/plugin-sdk/proxy-capture";
import { resolveRequestUrl } from "mangabaclaw/plugin-sdk/request-url";
import { danger } from "mangabaclaw/plugin-sdk/runtime-env";
import type { RuntimeEnv } from "mangabaclaw/plugin-sdk/runtime-env";
import { fetchWithRuntimeDispatcher } from "mangabaclaw/plugin-sdk/runtime-fetch";
import { Agent } from "undici";
import { createDiscordDnsLookup } from "../network-config.js";
import { withValidatedDiscordProxy } from "../proxy-fetch.js";

const discordDnsLookup = createDiscordDnsLookup();

type DiscordRestDispatcher =
  | InstanceType<typeof Agent>
  | ReturnType<typeof createHttp1EnvHttpProxyAgent>
  | ReturnType<typeof createHttp1ProxyAgent>;

function createDirectDiscordRestDispatcher(): InstanceType<typeof Agent> {
  return new Agent({
    allowH2: false,
    connect: { lookup: discordDnsLookup },
  });
}

function createEnvProxyDiscordRestDispatcher(
  runtime: RuntimeEnv,
): ReturnType<typeof createHttp1EnvHttpProxyAgent> | undefined {
  const envProxyOptions = resolveEnvHttpProxyAgentOptions();
  if (!envProxyOptions) {
    return undefined;
  }
  try {
    return createHttp1EnvHttpProxyAgent({
      ...envProxyOptions,
      connect: { lookup: discordDnsLookup },
    });
  } catch (err) {
    runtime.error?.(
      danger(
        `discord: env proxy unavailable for REST fetch; using direct dispatcher: ${formatErrorMessage(err)}`,
      ),
    );
    return undefined;
  }
}

function createDiscordRestFetchWithDispatcher(dispatcher: DiscordRestDispatcher): typeof fetch {
  return wrapFetchWithAbortSignal(((input: RequestInfo | URL, init?: RequestInit) =>
    fetchWithRuntimeDispatcher(input, { ...init, dispatcher }).then((response) => {
      captureHttpExchange({
        url: resolveRequestUrl(input),
        method: init?.method ?? "GET",
        requestHeaders: init?.headers as Headers | Record<string, string> | undefined,
        requestBody: (init as RequestInit & { body?: BodyInit | null })?.body ?? null,
        response,
        flowId: randomUUID(),
        meta: { subsystem: "discord-rest" },
      });
      return response;
    })) as typeof fetch);
}

export function resolveDiscordRestFetch(
  proxyUrl: string | undefined,
  runtime: RuntimeEnv,
): typeof fetch {
  const effectiveProxyUrl = resolveEffectiveDebugProxyUrl(proxyUrl);
  if (effectiveProxyUrl) {
    const fetcher = withValidatedDiscordProxy(effectiveProxyUrl, runtime, (proxy) =>
      createDiscordRestFetchWithDispatcher(createHttp1ProxyAgent({ uri: proxy })),
    );
    if (!fetcher) {
      return fetch;
    }
    runtime.log?.("discord: rest proxy enabled");
    return fetcher;
  }

  const fetcher = createDiscordRestFetchWithDispatcher(
    createEnvProxyDiscordRestDispatcher(runtime) ?? createDirectDiscordRestDispatcher(),
  );
  return fetcher;
}
