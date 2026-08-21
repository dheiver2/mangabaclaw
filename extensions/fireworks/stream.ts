// Fireworks plugin module implements stream behavior.
import type { StreamFn } from "mangabaclaw/plugin-sdk/agent-core";
import type { ProviderWrapStreamFnContext } from "mangabaclaw/plugin-sdk/plugin-entry";
import { normalizeProviderId } from "mangabaclaw/plugin-sdk/provider-model-shared";
import { createPayloadPatchStreamWrapper } from "mangabaclaw/plugin-sdk/provider-stream-shared";
import { isFireworksKimiModelId } from "./model-id.js";

function isFireworksProviderId(providerId: string): boolean {
  const normalized = normalizeProviderId(providerId);
  return normalized === "fireworks" || normalized === "fireworks-ai";
}

export function wrapFireworksProviderStream(
  ctx: ProviderWrapStreamFnContext,
): StreamFn | undefined {
  if (
    !isFireworksProviderId(ctx.provider) ||
    ctx.model?.api !== "openai-completions" ||
    !isFireworksKimiModelId(ctx.modelId)
  ) {
    return undefined;
  }
  return createPayloadPatchStreamWrapper(ctx.streamFn, ({ payload }) => {
    // Fireworks Kimi can emit chain-of-thought in visible `content` unless
    // the Anthropic-style thinking toggle is explicitly disabled.
    payload.thinking = { type: "disabled" };
    delete payload.reasoning;
    delete payload.reasoning_effort;
    delete payload.reasoningEffort;
  });
}
