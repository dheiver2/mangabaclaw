import { describe, expect, it } from "vitest";
import {
  findMangabaClawAgentDatabaseMediaMigrationRequiredError,
  MangabaClawAgentDatabaseMediaMigrationRequiredError,
} from "./mangabaclaw-agent-db-migration-required.js";

describe("agent database media migration error classification", () => {
  it("recognizes a rehydrated exact migration error through its cause chain", () => {
    const original = new MangabaClawAgentDatabaseMediaMigrationRequiredError(
      "/tmp/mangabaclaw-agent.sqlite",
      14,
    );
    const rehydrated = new Error("startup failed", {
      cause: new Error(original.message),
    });

    expect(findMangabaClawAgentDatabaseMediaMigrationRequiredError(rehydrated)).toMatchObject({
      pathname: "/tmp/mangabaclaw-agent.sqlite",
      schemaVersion: 14,
    });
  });

  it("does not classify similar operator guidance as the migration error", () => {
    expect(
      findMangabaClawAgentDatabaseMediaMigrationRequiredError(
        new Error("MangabaClaw agent database is outdated; run mangabaclaw doctor --fix to migrate it."),
      ),
    ).toBeUndefined();
  });
});
