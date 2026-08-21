// LongCat stream helpers apply the provider's binary thinking control.
import type { ProviderWrapStreamFnContext } from "mangabaclaw/plugin-sdk/plugin-entry";
import { createPayloadPatchStreamWrapper } from "mangabaclaw/plugin-sdk/provider-stream-shared";

export function createLongCatThinkingWrapper(
  baseStreamFn: ProviderWrapStreamFnContext["streamFn"],
  thinkingLevel: ProviderWrapStreamFnContext["thinkingLevel"],
): NonNullable<ProviderWrapStreamFnContext["streamFn"]> {
  return createPayloadPatchStreamWrapper(
    baseStreamFn,
    ({ payload }) => {
      payload.thinking = { type: thinkingLevel === "off" ? "disabled" : "enabled" };
      delete payload.reasoning_effort;
    },
    {
      shouldPatch: ({ model }) =>
        model.api === "openai-completions" && model.provider === "longcat",
    },
  );
}
