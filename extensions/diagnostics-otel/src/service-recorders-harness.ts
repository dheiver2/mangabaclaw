import { SpanStatusCode } from "@opentelemetry/api";
import {
  normalizeDiagnosticValue,
  normalizeDiagnosticLane,
} from "mangabaclaw/plugin-sdk/diagnostic-runtime";
import type {
  DiagnosticEventMetadata,
  DiagnosticEventPayload,
  DiagnosticEventPrivateData,
} from "../api.js";
import { normalizeOtelErrorMessage } from "./service-content-normalization.js";
import type { DiagnosticsRecorderRuntime } from "./service-recorder-runtime.js";
import type { HarnessRunDiagnosticEvent, ModelFailoverDiagnosticEvent } from "./service-types.js";

export function createHarnessRecorders(runtime: DiagnosticsRecorderRuntime) {
  const {
    harnessDurationHistogram,
    modelFailoverCounter,
    activeTrustedSpans,
    spanWithDuration,
    trustedTraceContext,
    activeTrustedParentContext,
    trackTrustedSpan,
    setSpanAttrs,
    completeTrackedLifecycleSpan,
    addRunAttrs,
    tracesEnabled,
  } = runtime;

  const harnessRunMetricAttrs = (evt: HarnessRunDiagnosticEvent) => ({
    "mangabaclaw.harness.id": normalizeDiagnosticValue(evt.harnessId, "unknown"),
    "mangabaclaw.harness.plugin": normalizeDiagnosticValue(evt.pluginId),
    ...(evt.type === "harness.run.started"
      ? {}
      : {
          "mangabaclaw.outcome": evt.type === "harness.run.error" ? "error" : evt.outcome,
        }),
    "mangabaclaw.provider": normalizeDiagnosticValue(evt.provider, "unknown"),
    "mangabaclaw.model": normalizeDiagnosticValue(evt.model, "unknown"),
    ...(evt.channel ? { "mangabaclaw.channel": normalizeDiagnosticValue(evt.channel) } : {}),
  });

  const recordHarnessRunStarted = (
    evt: Extract<DiagnosticEventPayload, { type: "harness.run.started" }>,
    metadata: DiagnosticEventMetadata,
  ) => {
    if (!tracesEnabled || !metadata.trusted) {
      return;
    }
    trackTrustedSpan(
      evt,
      metadata,
      spanWithDuration("mangabaclaw.harness.run", harnessRunMetricAttrs(evt), undefined, {
        parentContext: activeTrustedParentContext(evt, metadata),
        startTimeMs: evt.ts,
      }),
    );
  };

  const recordHarnessRunCompleted = (
    evt: Extract<DiagnosticEventPayload, { type: "harness.run.completed" }>,
    metadata: DiagnosticEventMetadata,
    privateData: DiagnosticEventPrivateData,
  ) => {
    harnessDurationHistogram.record(evt.durationMs, harnessRunMetricAttrs(evt));
    if (!tracesEnabled) {
      return;
    }
    const spanAttrs: Record<string, string | number | boolean> = {
      ...harnessRunMetricAttrs(evt),
    };
    if (evt.resultClassification) {
      spanAttrs["mangabaclaw.harness.result_classification"] = normalizeDiagnosticValue(
        evt.resultClassification,
      );
    }
    if (typeof evt.yieldDetected === "boolean") {
      spanAttrs["mangabaclaw.harness.yield_detected"] = evt.yieldDetected;
    }
    if (evt.itemLifecycle) {
      spanAttrs["mangabaclaw.harness.items.started"] = evt.itemLifecycle.startedCount;
      spanAttrs["mangabaclaw.harness.items.completed"] = evt.itemLifecycle.completedCount;
      spanAttrs["mangabaclaw.harness.items.active"] = evt.itemLifecycle.activeCount;
    }
    // Redacted message goes on the span only, never the low-cardinality metric attrs.
    const redactedError = normalizeOtelErrorMessage(privateData.errorMessage);
    if (redactedError) {
      spanAttrs["mangabaclaw.error"] = redactedError;
    }
    const trustedTrace = trustedTraceContext(evt, metadata);
    const trackedSpan = trustedTrace?.spanId
      ? activeTrustedSpans.get(trustedTrace.spanId)
      : undefined;
    const span =
      trackedSpan ??
      spanWithDuration("mangabaclaw.harness.run", spanAttrs, evt.durationMs, {
        parentContext: activeTrustedParentContext(evt, metadata),
        endTimeMs: evt.ts,
      });
    setSpanAttrs(span, spanAttrs);
    if (evt.outcome === "error") {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: redactedError ?? "error",
      });
    }
    if (trackedSpan && trustedTrace?.spanId) {
      completeTrackedLifecycleSpan(trustedTrace, trackedSpan, evt.ts);
      return;
    }
    span.end(evt.ts);
  };

  const recordHarnessRunError = (
    evt: Extract<DiagnosticEventPayload, { type: "harness.run.error" }>,
    metadata: DiagnosticEventMetadata,
    privateData: DiagnosticEventPrivateData,
  ) => {
    const errorType = normalizeDiagnosticValue(evt.errorCategory, "other");
    const attrs = {
      ...harnessRunMetricAttrs(evt),
      "mangabaclaw.harness.phase": evt.phase,
      "mangabaclaw.errorCategory": errorType,
    };
    harnessDurationHistogram.record(evt.durationMs, attrs);
    if (!tracesEnabled) {
      return;
    }
    // Redacted message goes on the span only; attrs above feed the metric.
    const redactedError = normalizeOtelErrorMessage(privateData.errorMessage);
    const spanAttrs: Record<string, string | number | boolean> = {
      ...attrs,
      "error.type": errorType,
      ...(redactedError ? { "mangabaclaw.error": redactedError } : {}),
      ...(evt.cleanupFailed ? { "mangabaclaw.harness.cleanup_failed": true } : {}),
    };
    const trustedTrace = trustedTraceContext(evt, metadata);
    const trackedSpan = trustedTrace?.spanId
      ? activeTrustedSpans.get(trustedTrace.spanId)
      : undefined;
    const span =
      trackedSpan ??
      spanWithDuration("mangabaclaw.harness.run", spanAttrs, evt.durationMs, {
        parentContext: activeTrustedParentContext(evt, metadata),
        endTimeMs: evt.ts,
      });
    setSpanAttrs(span, spanAttrs);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: redactedError ?? errorType,
    });
    // Retain on the error path too: for the mangabaclaw harness this span is the only
    // ancestor a late child can attach to, and aborted turns emit no run.completed.
    if (trackedSpan && trustedTrace?.spanId) {
      completeTrackedLifecycleSpan(trustedTrace, trackedSpan, evt.ts);
      return;
    }
    span.end(evt.ts);
  };

  const recordContextAssembled = (
    evt: Extract<DiagnosticEventPayload, { type: "context.assembled" }>,
    metadata: DiagnosticEventMetadata,
  ) => {
    if (!tracesEnabled) {
      return;
    }
    const spanAttrs: Record<string, string | number | boolean> = {
      "mangabaclaw.context.message_count": evt.messageCount,
      "mangabaclaw.context.history_text_chars": evt.historyTextChars,
      "mangabaclaw.context.history_image_blocks": evt.historyImageBlocks,
      "mangabaclaw.context.max_message_text_chars": evt.maxMessageTextChars,
      "mangabaclaw.context.system_prompt_chars": evt.systemPromptChars,
      "mangabaclaw.context.prompt_chars": evt.promptChars,
      "mangabaclaw.context.prompt_images": evt.promptImages,
    };
    addRunAttrs(spanAttrs, evt);
    if (evt.contextTokenBudget !== undefined) {
      spanAttrs["mangabaclaw.context.token_budget"] = evt.contextTokenBudget;
    }
    if (evt.reserveTokens !== undefined) {
      spanAttrs["mangabaclaw.context.reserve_tokens"] = evt.reserveTokens;
    }
    const span = spanWithDuration("mangabaclaw.context.assembled", spanAttrs, 0, {
      parentContext: activeTrustedParentContext(evt, metadata),
      endTimeMs: evt.ts,
    });
    span.end(evt.ts);
  };

  const recordModelFailover = (
    evt: ModelFailoverDiagnosticEvent,
    metadata: DiagnosticEventMetadata,
  ) => {
    const metricAttrs: Record<string, string> = {
      "mangabaclaw.failover.reason": normalizeDiagnosticValue(evt.reason, "unknown"),
      "mangabaclaw.failover.suspended":
        evt.suspended === undefined ? "unknown" : String(evt.suspended),
      "mangabaclaw.lane": normalizeDiagnosticLane(evt.lane, "unknown"),
      "mangabaclaw.model": normalizeDiagnosticValue(evt.fromModel),
      "mangabaclaw.provider": normalizeDiagnosticValue(evt.fromProvider),
      "mangabaclaw.failover.to_model": normalizeDiagnosticValue(evt.toModel),
      "mangabaclaw.failover.to_provider": normalizeDiagnosticValue(evt.toProvider),
    };
    modelFailoverCounter.add(1, metricAttrs);
    if (!tracesEnabled) {
      return;
    }
    const spanAttrs: Record<string, string | number | boolean> = {
      "mangabaclaw.failover.reason": normalizeDiagnosticValue(evt.reason, "unknown"),
    };
    if (evt.fromProvider) {
      spanAttrs["mangabaclaw.provider"] = evt.fromProvider;
    }
    if (evt.fromModel) {
      spanAttrs["mangabaclaw.model"] = evt.fromModel;
    }
    if (evt.toProvider) {
      spanAttrs["mangabaclaw.failover.to_provider"] = evt.toProvider;
    }
    if (evt.toModel) {
      spanAttrs["mangabaclaw.failover.to_model"] = evt.toModel;
    }
    if (evt.lane) {
      spanAttrs["mangabaclaw.lane"] = normalizeDiagnosticLane(evt.lane, "unknown");
    }
    if (evt.suspended !== undefined) {
      spanAttrs["mangabaclaw.failover.suspended"] = evt.suspended;
    }
    if (evt.cascadeDepth !== undefined) {
      spanAttrs["mangabaclaw.failover.cascade_depth"] = evt.cascadeDepth;
    }
    const span = spanWithDuration("mangabaclaw.model.failover", spanAttrs, 0, {
      parentContext: activeTrustedParentContext(evt, metadata),
      endTimeMs: evt.ts,
    });
    span.end(evt.ts);
  };

  return {
    recordHarnessRunStarted,
    recordHarnessRunCompleted,
    recordHarnessRunError,
    recordContextAssembled,
    recordModelFailover,
  };
}
