// Identifies MangabaClaw-authored assistant rows that are transcript bookkeeping,
// not provider model output. Some history surfaces keep gateway-injected rows
// visible, so use the narrower delivery-mirror predicate when visibility matters.
export const MANGABACLAW_TRANSCRIPT_ARTIFACT_API = "mangabaclaw-transcript" as const;
export const MANGABACLAW_TRANSCRIPT_ARTIFACT_PROVIDER = "mangabaclaw" as const;
export const MANGABACLAW_DELIVERY_MIRROR_MODEL = "delivery-mirror" as const;
const MANGABACLAW_GATEWAY_INJECTED_MODEL = "gateway-injected" as const;

const TRANSCRIPT_ONLY_MANGABACLAW_ASSISTANT_MODELS = new Set<string>([
  MANGABACLAW_DELIVERY_MIRROR_MODEL,
  MANGABACLAW_GATEWAY_INJECTED_MODEL,
]);
const MANGABACLAW_DELIVERY_MIRROR_KINDS = new Set([
  "channel-final",
  "channel-final-suppressed",
  "message-tool-source-reply",
]);

function isMangabaClawDeliveryMirrorMarker(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === "string" && MANGABACLAW_DELIVERY_MIRROR_KINDS.has(kind);
}

export function isTranscriptOnlyMangabaClawAssistantModel(provider: unknown, model: unknown): boolean {
  return (
    provider === MANGABACLAW_TRANSCRIPT_ARTIFACT_PROVIDER &&
    typeof model === "string" &&
    TRANSCRIPT_ONLY_MANGABACLAW_ASSISTANT_MODELS.has(model)
  );
}

/**
 * Returns true when the message is an MangabaClaw-authored transcript artifact
 * that must not be replayed to providers.
 *
 * Primary check: provider="mangabaclaw" + model in known transcript-only set.
 * Fallback: a valid mangabaclawDeliveryMirror marker catches observed historical
 * rows whose provider/model provenance was stripped (#99470).
 */
export function isTranscriptOnlyMangabaClawAssistantMessage(message: unknown): boolean {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const entry = message as {
    role?: unknown;
    provider?: unknown;
    model?: unknown;
    mangabaclawDeliveryMirror?: unknown;
  };
  if (entry.role !== "assistant") {
    return false;
  }
  if (isTranscriptOnlyMangabaClawAssistantModel(entry.provider, entry.model)) {
    return true;
  }
  return isMangabaClawDeliveryMirrorMarker(entry.mangabaclawDeliveryMirror);
}

export function isMangabaClawMessageToolMirrorAssistantMessage(message: unknown): boolean {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const entry = message as { role?: unknown; mangabaclawMessageToolMirror?: unknown };
  return entry.role === "assistant" && entry.mangabaclawMessageToolMirror !== undefined;
}

export function isMangabaClawInternalSourceReplyMirrorAssistantMessage(message: unknown): boolean {
  if (!isMangabaClawMessageToolMirrorAssistantMessage(message)) {
    return false;
  }
  const marker = (message as { mangabaclawMessageToolMirror?: unknown }).mangabaclawMessageToolMirror;
  return (
    Boolean(marker) &&
    typeof marker === "object" &&
    !Array.isArray(marker) &&
    (marker as { sourceReplySink?: unknown }).sourceReplySink === "internal-ui"
  );
}

export function isMangabaClawDeliveryMirrorAssistantMessage(message: unknown): boolean {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const entry = message as { role?: unknown; provider?: unknown; model?: unknown };
  return (
    entry.role === "assistant" &&
    entry.provider === MANGABACLAW_TRANSCRIPT_ARTIFACT_PROVIDER &&
    entry.model === MANGABACLAW_DELIVERY_MIRROR_MODEL
  );
}
