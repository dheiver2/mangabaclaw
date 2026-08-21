import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectPersistedAuthProfileStateRaw,
  inspectPersistedAuthProfileStoreRaw,
  resolveAuthProfileDatabasePath,
  runAuthProfileWriteTransaction,
  writePersistedAuthProfileStateRaw,
  writePersistedAuthProfileStoreRaw,
} from "../../src/agents/auth-profiles/sqlite.js";
import { closeMangabaClawAgentDatabasesForTest } from "../../src/state/mangabaclaw-agent-db.js";
import { closeMangabaClawStateDatabaseForTest } from "../../src/state/mangabaclaw-state-db.js";
import { stageLiveAuthProfiles } from "./stage-live-auth-profiles.js";

const tempDirs = new Set<string>();

function createStateDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.add(dir);
  return dir;
}

function createAuthSource(stateDir: string): string {
  const agentDir = path.join(stateDir, "agents", "main", "agent");
  runAuthProfileWriteTransaction(
    agentDir,
    (database) => {
      writePersistedAuthProfileStoreRaw(
        {
          version: 1,
          profiles: {
            "openai:test": {
              type: "api_key",
              provider: "openai",
              keyRef: { source: "env", provider: "default", id: "MANGABACLAW_LIVE_OPENAI_KEY" },
            },
          },
        },
        agentDir,
        database,
      );
      writePersistedAuthProfileStateRaw(
        { version: 1, order: { openai: ["openai:test"] } },
        agentDir,
        database,
      );
    },
    { stateDir },
  );
  closeMangabaClawAgentDatabasesForTest();
  closeMangabaClawStateDatabaseForTest();
  return agentDir;
}

afterEach(() => {
  closeMangabaClawAgentDatabasesForTest();
  closeMangabaClawStateDatabaseForTest();
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
});

describe("stage-live-auth-profiles", () => {
  it.each(["auth_profile_store", "auth_profile_state"] as const)(
    "fails closed when %s is the only missing auth table",
    (missingTable) => {
      const sourceStateDir = createStateDir("mangabaclaw-live-auth-partial-source-");
      const targetStateDir = createStateDir("mangabaclaw-live-auth-partial-target-");
      const sourceAgentDir = createAuthSource(sourceStateDir);
      const database = new DatabaseSync(resolveAuthProfileDatabasePath(sourceAgentDir));
      database.exec(`DROP TABLE ${missingTable};`);
      database.close();

      expect(() => stageLiveAuthProfiles(sourceStateDir, targetStateDir)).toThrow(
        "canonical auth schema is incomplete",
      );
      expect(
        fs.existsSync(
          resolveAuthProfileDatabasePath(path.join(targetStateDir, "agents", "main", "agent")),
        ),
      ).toBe(false);
    },
  );

  it("fails closed when both auth tables are absent", () => {
    const sourceStateDir = createStateDir("mangabaclaw-live-auth-legacy-source-");
    const targetStateDir = createStateDir("mangabaclaw-live-auth-legacy-target-");
    const sourceAgentDir = createAuthSource(sourceStateDir);
    const database = new DatabaseSync(resolveAuthProfileDatabasePath(sourceAgentDir));
    database.exec("DROP TABLE auth_profile_store; DROP TABLE auth_profile_state;");
    database.close();

    expect(() => stageLiveAuthProfiles(sourceStateDir, targetStateDir)).toThrow(
      "canonical auth schema is incomplete",
    );
    expect(
      fs.existsSync(
        resolveAuthProfileDatabasePath(path.join(targetStateDir, "agents", "main", "agent")),
      ),
    ).toBe(false);
  });

  it("stages a readable store when the state row is absent", () => {
    const sourceStateDir = createStateDir("mangabaclaw-live-auth-row-source-");
    const targetStateDir = createStateDir("mangabaclaw-live-auth-row-target-");
    const sourceAgentDir = createAuthSource(sourceStateDir);
    const database = new DatabaseSync(resolveAuthProfileDatabasePath(sourceAgentDir));
    database.exec("DELETE FROM auth_profile_state;");
    database.close();

    expect(() => stageLiveAuthProfiles(sourceStateDir, targetStateDir)).not.toThrow();
    const targetAgentDir = path.join(targetStateDir, "agents", "main", "agent");
    expect(inspectPersistedAuthProfileStoreRaw(targetAgentDir).status).toBe("readable");
    expect(inspectPersistedAuthProfileStateRaw(targetAgentDir)).toEqual({
      status: "missing",
      reason: "row",
    });
  });
});
