// Gateway JSON parsing helper.
// Safely parses optional JSON payloads while preserving invalid raw payload text.
import { normalizeOptionalString } from "@mangabaclaw/normalization-core/string-coerce";

/** Safely parses an optional JSON string, returning a payloadJSON wrapper on parse failure. */
export function parseGatewayPayload(value: string | null | undefined): unknown {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { payloadJSON: value };
  }
}
