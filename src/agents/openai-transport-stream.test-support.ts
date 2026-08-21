import "./ai-transport-runtime-host.js";
import "@mangabaclaw/ai/transports";

const responsesTesting = globalThis.mangabaclawOpenAIResponsesTransportTestApi;
if (!responsesTesting) {
  throw new Error("OpenAI transport test APIs are unavailable outside test mode");
}

type OpenAIResponsesTransportTestApi = NonNullable<
  typeof globalThis.mangabaclawOpenAIResponsesTransportTestApi
>;

// Keep declaration emit on the public test-API names instead of transport internals.
export const testing: OpenAIResponsesTransportTestApi = responsesTesting;
