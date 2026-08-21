import { asFiniteNumber } from "@mangabaclaw/normalization-core/number-coercion";

export const normalizeTranscriptTimestamp = asFiniteNumber;

export function isWithinTranscriptWindow(
  timestamp: number | undefined,
  options: { beforeTimestampMs?: number; minTimestampMs?: number },
): boolean {
  return (
    (options.beforeTimestampMs === undefined ||
      timestamp === undefined ||
      timestamp < options.beforeTimestampMs) &&
    (options.minTimestampMs === undefined ||
      timestamp === undefined ||
      timestamp >= options.minTimestampMs)
  );
}

export function normalizeRecentTranscriptLimit(limit: number | undefined): number {
  return Math.max(1, Math.floor(limit ?? 10));
}

export function readPreferredUpstreamUserText(message: {
  __mangabaclaw?: unknown;
}): string | null | undefined {
  const meta =
    message["__mangabaclaw"] && typeof message["__mangabaclaw"] === "object"
      ? (message["__mangabaclaw"] as Record<string, unknown>)
      : undefined;
  if (typeof meta?.upstreamUserText === "string") {
    return meta.upstreamUserText.trim();
  }
  return meta?.mirrorOrigin ? null : undefined;
}
