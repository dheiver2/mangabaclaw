import { describe, expect, it } from "vitest";
import {
  findMangabaClawStateDatabaseSchemaMigrationRequiredError,
  MangabaClawStateDatabaseSchemaMigrationRequiredError,
} from "./mangabaclaw-state-db-schema-migration-required.js";

describe("state database schema migration error classification", () => {
  it("recognizes a rehydrated exact migration error through its cause chain", () => {
    const original = new MangabaClawStateDatabaseSchemaMigrationRequiredError(
      "agent-databases-composite-primary-key",
      "/tmp/mangabaclaw.sqlite",
    );
    const rehydrated = new Error("startup failed", {
      cause: new Error(original.message),
    });

    expect(findMangabaClawStateDatabaseSchemaMigrationRequiredError(rehydrated)).toMatchObject({
      kind: "agent-databases-composite-primary-key",
      pathname: "/tmp/mangabaclaw.sqlite",
    });
  });

  it("recognizes an exact instance of the typed error", () => {
    const original = new MangabaClawStateDatabaseSchemaMigrationRequiredError(
      "audit-events-v2",
      "/tmp/mangabaclaw.sqlite",
    );

    expect(findMangabaClawStateDatabaseSchemaMigrationRequiredError(original)).toBe(original);
  });

  it("does not classify similar operator guidance as the migration error", () => {
    expect(
      findMangabaClawStateDatabaseSchemaMigrationRequiredError(
        new Error(
          "MangabaClaw state database /tmp/mangabaclaw.sqlite is stale; run mangabaclaw doctor --fix.",
        ),
      ),
    ).toBeUndefined();
  });

  it("does not classify the agent DB media migration error", () => {
    // Ensure the state-DB classifier does not accidentally match agent-DB messages.
    expect(
      findMangabaClawStateDatabaseSchemaMigrationRequiredError(
        new Error(
          "MangabaClaw agent database /tmp/mangabaclaw-agent.sqlite uses schema version 5; run mangabaclaw doctor --fix to migrate persisted media before using it.",
        ),
      ),
    ).toBeUndefined();
  });
});
