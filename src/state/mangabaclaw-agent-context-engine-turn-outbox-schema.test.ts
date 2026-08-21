import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONTEXT_ENGINE_TURN_OUTBOX_TABLE,
  ensureContextEngineTurnOutboxSchema,
} from "./mangabaclaw-agent-context-engine-turn-outbox-schema.js";
import {
  closeMangabaClawAgentDatabasesForTest,
  openMangabaClawAgentDatabase,
} from "./mangabaclaw-agent-db.js";

const tempDirs: string[] = [];

afterEach(() => {
  closeMangabaClawAgentDatabasesForTest();
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("context-engine turn outbox schema", () => {
  it("opens a current database without the additive table and installs it on first use", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-context-outbox-schema-"));
    tempDirs.push(stateDir);
    const options = {
      agentId: "main",
      env: { MANGABACLAW_STATE_DIR: stateDir },
    };
    const initial = openMangabaClawAgentDatabase(options);
    const databasePath = initial.path;
    closeMangabaClawAgentDatabasesForTest();

    const shipped = new DatabaseSync(databasePath);
    shipped.exec(`
      DROP INDEX idx_agent_context_engine_turn_outbox_engine;
      DROP TABLE ${CONTEXT_ENGINE_TURN_OUTBOX_TABLE};
    `);
    shipped.close();

    const reopened = openMangabaClawAgentDatabase(options);
    expect(
      reopened.db
        .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
        .get(CONTEXT_ENGINE_TURN_OUTBOX_TABLE),
    ).toBeUndefined();

    ensureContextEngineTurnOutboxSchema(reopened.db);

    expect(
      reopened.db
        .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
        .get(CONTEXT_ENGINE_TURN_OUTBOX_TABLE),
    ).toEqual({ 1: 1 });
  });
});
