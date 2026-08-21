/**
 * Built-in MangabaClaw harness registration.
 *
 * Harness selection uses this factory to expose the embedded MangabaClaw runtime
 * through the same AgentHarness contract as external harness plugins.
 */
import { MANGABACLAW_EMBEDDED_CONTEXT_ENGINE_HOST } from "../../context-engine/host-compat.js";
import { runEmbeddedAttempt } from "../embedded-agent-runner/run/attempt.js";
import type { EmbeddedRunAttemptParams } from "../embedded-agent-runner/run/types.js";
import { completeWithPreparedSimpleCompletionModel } from "../simple-completion-runtime.js";
import { projectSettledTurnFinalizationAttemptResult } from "./settled-turn-finalization-result.js";
import type {
  AgentHarness,
  AgentHarnessAttemptParamsV2,
  AgentHarnessSettledTurnFinalizationAttemptParams,
  AgentHarnessV2,
} from "./types.js";

const builtInMangabaClawHarnesses = new WeakSet<object>();

function buildRestrictedFinalizationAttempt(
  attempt: AgentHarnessSettledTurnFinalizationAttemptParams<AgentHarnessAttemptParamsV2>,
): EmbeddedRunAttemptParams {
  const internalAttempt =
    attempt as AgentHarnessSettledTurnFinalizationAttemptParams<AgentHarnessAttemptParamsV2> &
      Pick<EmbeddedRunAttemptParams, "admittedRunContext">;
  return {
    admittedRunContext: internalAttempt.admittedRunContext,
    sessionId: attempt.sessionId,
    sessionKey: attempt.sessionKey,
    sessionTarget: attempt.sessionTarget,
    lifecycleGeneration: attempt.lifecycleGeneration,
    promptCacheKey: attempt.promptCacheKey,
    sandboxSessionKey: attempt.sandboxSessionKey,
    agentId: attempt.agentId,
    workspaceDir: attempt.workspaceDir,
    cwd: attempt.cwd,
    agentDir: attempt.agentDir,
    config: attempt.config,
    prompt: attempt.prompt,
    timeoutMs: attempt.timeoutMs,
    runTimeoutOverrideMs: attempt.runTimeoutOverrideMs,
    runId: attempt.runId,
    abortSignal: attempt.abortSignal,
    onExecutionStarted: attempt.onExecutionStarted,
    onExecutionPhase: attempt.onExecutionPhase,
    onLaneWait: attempt.onLaneWait,
    onRunProgress: attempt.onRunProgress,
    onAttemptTimeoutArmed: attempt.onAttemptTimeoutArmed,
    onAttemptTimeout: attempt.onAttemptTimeout,
    onAttemptAbort: attempt.onAttemptAbort,
    preparedModelRuntime: attempt.preparedModelRuntime,
    sessionFile: attempt.sessionFile,
    contextTokenBudget: attempt.contextTokenBudget,
    contextWindowInfo: attempt.contextWindowInfo,
    resolvedApiKey: attempt.resolvedApiKey,
    authProfileId: attempt.authProfileId,
    authProfileIdSource: attempt.authProfileIdSource,
    provider: attempt.provider,
    modelId: attempt.modelId,
    requestedModelId: attempt.requestedModelId,
    agentHarnessId: attempt.agentHarnessId,
    runtimePlan: attempt.runtimePlan,
    model: attempt.model,
    authStorage: attempt.authStorage,
    authProfileStore: attempt.authProfileStore,
    toolAuthProfileStore: attempt.toolAuthProfileStore,
    modelRegistry: attempt.modelRegistry,
    thinkLevel: attempt.thinkLevel,
    fastMode: attempt.fastMode,
    fastModeAuto: attempt.fastModeAuto,
    operation: "settled-tool-finalization",
    disableTools: true,
    disableTrajectory: true,
    skipPreparedUserTurnMessage: true,
    suppressNextUserMessagePersistence: true,
    initialReplayState: { replayInvalid: false, hadPotentialSideEffects: false },
  };
}

/** Creates the built-in harness backed by the embedded MangabaClaw agent runner. */
export function createMangabaClawAgentHarness(): AgentHarnessV2 {
  const harness: AgentHarnessV2 = {
    id: "mangabaclaw",
    label: "MangabaClaw embedded agent",
    contextEngineHostCapabilities: MANGABACLAW_EMBEDDED_CONTEXT_ENGINE_HOST.capabilities,
    supports: () => ({ supported: true, priority: 0 }),
    runAttempt: (params) => runEmbeddedAttempt(params as EmbeddedRunAttemptParams),
    runIsolatedCompletionV2: async (params) => {
      if (params.authorization.owner !== "host") {
        throw new Error("The built-in MangabaClaw harness requires host-prepared authorization.");
      }
      const timeoutSignal = AbortSignal.timeout(params.timeoutMs);
      const signal = params.abortSignal
        ? AbortSignal.any([params.abortSignal, timeoutSignal])
        : timeoutSignal;
      const assistant = await completeWithPreparedSimpleCompletionModel({
        model: params.authorization.model,
        auth: params.authorization.auth,
        cfg: params.config,
        context: {
          systemPrompt: params.systemPrompt,
          messages: [{ role: "user", content: params.prompt, timestamp: Date.now() }],
          tools: [],
        },
        options: {
          maxTokens: params.streamParams?.maxTokens,
          temperature: params.streamParams?.temperature,
          reasoning: params.thinkLevel,
          signal,
        },
      });
      return { assistant };
    },
    finalizeSettledTurn: async ({ attempt }) => {
      // Preserve only transcript/model transport state. The operation-specific
      // runner path suppresses every ambient prompt and capability contributor.
      const result = await runEmbeddedAttempt(buildRestrictedFinalizationAttempt(attempt));
      return projectSettledTurnFinalizationAttemptResult(result);
    },
  };
  builtInMangabaClawHarnesses.add(harness);
  return harness;
}

/** Distinguishes the internal runtime from an untrusted harness that copies its public id. */
export function isBuiltInMangabaClawAgentHarness(harness: AgentHarness): boolean {
  return builtInMangabaClawHarnesses.has(harness);
}
