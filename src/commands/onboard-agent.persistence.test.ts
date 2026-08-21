import fs from "node:fs/promises";
import path from "node:path";
import { withTempHome } from "mangabaclaw/plugin-sdk/test-env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readConfigFileSnapshot,
  replaceConfigFile,
  resetConfigRuntimeState,
} from "../config/config.js";
import { readExactSessionEntryRowForCanonicalRepair } from "../config/sessions/session-accessor.sqlite-canonical-repair.js";
import { writeSessionEntry } from "../config/sessions/session-accessor.sqlite-entry-store.js";
import { appendTranscriptEventInTransaction } from "../config/sessions/session-accessor.sqlite-transcript-store.js";
import { runSessionStartupMigration } from "../config/sessions/startup-migration.js";
import { EMPTY_LEGACY_SESSION_SURFACES } from "../plugins/legacy-session-surfaces.types.js";
import {
  closeMangabaClawAgentDatabasesForTest,
  openMangabaClawAgentDatabase,
  runMangabaClawAgentWriteTransaction,
} from "../state/mangabaclaw-agent-db.js";
import { withExistingMangabaClawStateDatabaseReadOnly } from "../state/mangabaclaw-state-db-readonly.js";
import { closeMangabaClawStateDatabaseForTest } from "../state/mangabaclaw-state-db.js";
import { captureEnv, deleteTestEnvValue, setTestEnvValue } from "../test-utils/env.js";
import { ensureOnboardingAgent } from "./onboard-agent.js";

describe("onboarding authored config persistence", () => {
  let envSnapshot: ReturnType<typeof captureEnv>;

  beforeEach(() => {
    envSnapshot = captureEnv(["MANGABACLAW_AGENT_DIR", "MANGABACLAW_STATE_DIR", "MANGABACLAW_TOKEN"]);
  });

  afterEach(() => {
    envSnapshot.restore();
    closeMangabaClawAgentDatabasesForTest();
    closeMangabaClawStateDatabaseForTest();
    resetConfigRuntimeState();
  });

  it("retains env references and includes through the real snapshot writer", async () => {
    await withTempHome(async (home) => {
      const configDir = path.join(home, ".mangabaclaw");
      const configPath = path.join(configDir, "mangabaclaw.json");
      const includePath = path.join(configDir, "channels.json");
      const includeRaw = JSON.stringify({ channels: { telegram: { enabled: true } } });
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(includePath, includeRaw);
      await fs.writeFile(
        configPath,
        `{
          $include: "./channels.json",
          gateway: { auth: { mode: "token", token: "\${MANGABACLAW_TOKEN}" } }
        }`,
      );
      setTestEnvValue("MANGABACLAW_TOKEN", "plaintext-secret");
      resetConfigRuntimeState();

      const snapshot = await readConfigFileSnapshot();
      const candidate = {
        ...snapshot.config,
        gateway: { ...snapshot.config.gateway, mode: "local" as const },
      };
      const result = await ensureOnboardingAgent({
        config: candidate,
        workspace: path.join(home, "workspace"),
        baseConfig: snapshot.config,
      });
      await replaceConfigFile({ nextConfig: result.config, afterWrite: { mode: "auto" } });

      const persistedRaw = await fs.readFile(configPath, "utf8");
      expect(persistedRaw).toContain("${MANGABACLAW_TOKEN}");
      expect(persistedRaw).not.toContain("plaintext-secret");
      expect(persistedRaw).toContain("./channels.json");
      expect(await fs.readFile(includePath, "utf8")).toBe(includeRaw);
    });
  });

  it("leaves an existing roster config byte-identical", async () => {
    await withTempHome(async (home) => {
      const configDir = path.join(home, ".mangabaclaw");
      const configPath = path.join(configDir, "mangabaclaw.json");
      const raw = `{
  agents: { entries: { existing: { name: "Existing" } } },
}\n`;
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(configPath, raw);
      resetConfigRuntimeState();
      const snapshot = await readConfigFileSnapshot();

      await ensureOnboardingAgent({
        config: snapshot.config,
        workspace: path.join(home, "workspace"),
        firstAgent: { name: "ignored" },
      });

      expect(await fs.readFile(configPath, "utf8")).toBe(raw);
    });
  });

  it("renames a legacy install and converges its main session before returning", async () => {
    await withTempHome(async (rawHome) => {
      const home = await fs.realpath(rawHome);
      const stateDir = path.join(home, ".mangabaclaw");
      setTestEnvValue("MANGABACLAW_STATE_DIR", stateDir);
      deleteTestEnvValue("MANGABACLAW_AGENT_DIR");
      resetConfigRuntimeState();
      await replaceConfigFile({ nextConfig: {}, afterWrite: { mode: "auto" } });

      const legacyKey = "agent:main:main";
      const canonicalKey = "agent:robby:main";
      const legacyDatabasePath = path.join(
        stateDir,
        "agents",
        "main",
        "agent",
        "mangabaclaw-agent.sqlite",
      );
      const entry = { sessionId: "legacy-main-session", updatedAt: 100 };
      runMangabaClawAgentWriteTransaction(
        (database) => {
          writeSessionEntry(database, legacyKey, entry, {
            allowStoredAliases: true,
            previousEntry: null,
          });
          appendTranscriptEventInTransaction(
            database,
            {
              agentId: "main",
              path: legacyDatabasePath,
              sessionId: entry.sessionId,
              sessionKey: legacyKey,
            },
            { type: "message", text: "legacy history" },
            { allowStoredAlias: true },
          );
        },
        { agentId: "main", path: legacyDatabasePath },
      );

      const result = await ensureOnboardingAgent({
        config: {},
        workspace: path.join(stateDir, "workspace"),
        firstAgent: { name: "robby" },
      });
      const ownerDatabasePath = path.join(
        stateDir,
        "agents",
        "robby",
        "agent",
        "mangabaclaw-agent.sqlite",
      );
      const readEntry = (databasePath: string, agentId: string, key: string) =>
        runMangabaClawAgentWriteTransaction(
          (database) => readExactSessionEntryRowForCanonicalRepair(database, key)?.entry,
          { agentId, path: databasePath },
        );

      expect(result.agentId).toBe("robby");
      expect(readEntry(ownerDatabasePath, "robby", canonicalKey)).toMatchObject(entry);
      expect(readEntry(legacyDatabasePath, "main", legacyKey)).toBeUndefined();
      expect(
        withExistingMangabaClawStateDatabaseReadOnly(
          ({ db }) =>
            db
              .prepare(
                "SELECT status FROM migration_sources WHERE source_key = 'legacy-main-session-keys'",
              )
              .get() as { status: string },
        ),
      ).toEqual({ status: "completed" });
    });
  });

  it("surfaces a locked migration and converges it on the next startup", async () => {
    await withTempHome(async (rawHome) => {
      const home = await fs.realpath(rawHome);
      const stateDir = path.join(home, ".mangabaclaw");
      setTestEnvValue("MANGABACLAW_STATE_DIR", stateDir);
      deleteTestEnvValue("MANGABACLAW_AGENT_DIR");
      resetConfigRuntimeState();
      await replaceConfigFile({ nextConfig: {}, afterWrite: { mode: "auto" } });

      const legacyKey = "agent:main:main";
      const canonicalKey = "agent:robby:main";
      const legacyDatabasePath = path.join(
        stateDir,
        "agents",
        "main",
        "agent",
        "mangabaclaw-agent.sqlite",
      );
      const entry = { sessionId: "locked-legacy-session", updatedAt: 100 };
      runMangabaClawAgentWriteTransaction(
        (database) => {
          writeSessionEntry(database, legacyKey, entry, {
            allowStoredAliases: true,
            previousEntry: null,
          });
          appendTranscriptEventInTransaction(
            database,
            {
              agentId: "main",
              path: legacyDatabasePath,
              sessionId: entry.sessionId,
              sessionKey: legacyKey,
            },
            { type: "message", text: "locked history" },
            { allowStoredAlias: true },
          );
        },
        { agentId: "main", path: legacyDatabasePath },
      );
      const sourceDatabase = openMangabaClawAgentDatabase({
        agentId: "main",
        path: legacyDatabasePath,
      });
      sourceDatabase.db.exec("BEGIN IMMEDIATE");
      let result: Awaited<ReturnType<typeof ensureOnboardingAgent>>;
      try {
        result = await ensureOnboardingAgent({
          config: {},
          workspace: path.join(stateDir, "workspace"),
          firstAgent: { name: "robby" },
        });
      } finally {
        sourceDatabase.db.exec("ROLLBACK");
      }

      expect(result.sessionMigrationWarnings).toEqual([
        expect.stringMatching(/incomplete.*mangabaclaw doctor --fix/),
      ]);
      const readLedgerStatus = () =>
        withExistingMangabaClawStateDatabaseReadOnly(
          ({ db }) =>
            db
              .prepare(
                "SELECT status FROM migration_sources WHERE source_key = 'legacy-main-session-keys'",
              )
              .get() as { status: string } | undefined,
        );
      expect(readLedgerStatus()).toBeUndefined();
      const log = { info: vi.fn(), warn: vi.fn() };
      await runSessionStartupMigration({
        cfg: result.config,
        env: process.env,
        log,
        deps: {
          migrateOrphanedSessionKeys: vi.fn(async () => ({ changes: [], warnings: [] })),
          prepareLegacySessionSurfaces: () => EMPTY_LEGACY_SESSION_SURFACES,
          resolveAllAgentSessionStoreTargetsSync: () => [],
          sweepOrphanSessionStoreTemps: vi.fn(async () => 0),
        },
      });
      const ownerDatabasePath = path.join(
        stateDir,
        "agents",
        "robby",
        "agent",
        "mangabaclaw-agent.sqlite",
      );
      const readEntry = (databasePath: string, agentId: string, key: string) =>
        runMangabaClawAgentWriteTransaction(
          (database) => readExactSessionEntryRowForCanonicalRepair(database, key)?.entry,
          { agentId, path: databasePath },
        );

      expect(readEntry(ownerDatabasePath, "robby", canonicalKey)).toMatchObject(entry);
      expect(readEntry(legacyDatabasePath, "main", legacyKey)).toBeUndefined();
      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining("migrated retired main-agent session keys"),
      );
      expect(readLedgerStatus()).toEqual({ status: "completed" });
    });
  });
});
