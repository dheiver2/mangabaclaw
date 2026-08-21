// Assertion helpers for auth token redaction and token shape tests.
import { expect } from "vitest";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";

/** Asserts the generated Gateway auth token is both returned and persisted. */
export function expectGeneratedTokenPersistedToGatewayAuth(params: {
  generatedToken?: string;
  authToken?: string;
  persistedConfig?: MangabaClawConfig;
}) {
  expect(params.generatedToken).toMatch(/^[0-9a-f]{48}$/);
  expect(params.authToken).toBe(params.generatedToken);
  expect(params.persistedConfig?.gateway?.auth?.mode).toBe("token");
  expect(params.persistedConfig?.gateway?.auth?.token).toBe(params.generatedToken);
}
