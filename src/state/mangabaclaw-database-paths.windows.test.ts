// Windows database path tests exercise canonical state lifecycles beyond MAX_PATH.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { compactDoctorSessionSqliteTarget } from "../commands/doctor-session-sqlite-compact.js";
import { runDoctorStateSqliteCompact } from "../commands/doctor-state-sqlite-compact.js";
import { withMangabaClawAgentDatabaseReadOnly } from "./mangabaclaw-agent-db-readonly.js";
import {
  closeMangabaClawAgentDatabasesForTest,
  MANGABACLAW_AGENT_SCHEMA_VERSION,
  openMangabaClawAgentDatabase,
} from "./mangabaclaw-agent-db.js";
import { resolveMangabaClawAgentSqlitePath } from "./mangabaclaw-agent-db.paths.js";
import { preflightMangabaClawDatabaseSchemas } from "./mangabaclaw-database-preflight.js";
import { withMangabaClawStateDatabaseReadOnly } from "./mangabaclaw-state-db-readonly.js";
import {
  closeMangabaClawStateDatabaseForTest,
  openExistingMangabaClawStateDatabaseReadOnly,
  MANGABACLAW_STATE_SCHEMA_VERSION,
  openMangabaClawStateDatabase,
} from "./mangabaclaw-state-db.js";
import { resolveMangabaClawStateSqlitePath } from "./mangabaclaw-state-db.paths.js";

const MAX_PATH = 260;
const AGENT_ID = "windows-long-path";
const tempDirs = useAutoCleanupTempDirTracker((cleanup) => {
  afterEach(() => {
    closeMangabaClawAgentDatabasesForTest();
    closeMangabaClawStateDatabaseForTest();
    cleanup();
  });
});

function createDeepStateEnv(): NodeJS.ProcessEnv {
  const env = {
    ...process.env,
    MANGABACLAW_STATE_DIR: tempDirs.make("mangabaclaw-database-paths-windows-"),
  };
  while (
    resolveMangabaClawStateSqlitePath(env).length <= MAX_PATH ||
    resolveMangabaClawAgentSqlitePath({ agentId: AGENT_ID, env }).length <= MAX_PATH
  ) {
    env.MANGABACLAW_STATE_DIR = path.join(env.MANGABACLAW_STATE_DIR, `segment-${"x".repeat(24)}`);
  }
  fs.mkdirSync(env.MANGABACLAW_STATE_DIR, { recursive: true });
  return env;
}

describe("MangabaClaw database paths on Windows", () => {
  it.runIf(process.platform === "win32")(
    "opens, preflights, compacts, and reopens canonical databases beyond MAX_PATH",
    async () => {
      const env = createDeepStateEnv();
      const statePath = resolveMangabaClawStateSqlitePath(env);
      const agentPath = resolveMangabaClawAgentSqlitePath({ agentId: AGENT_ID, env });
      expect(statePath.startsWith("\\\\?\\")).toBe(false);
      expect(agentPath.startsWith("\\\\?\\")).toBe(false);
      expect(statePath.length).toBeGreaterThan(MAX_PATH);
      expect(agentPath.length).toBeGreaterThan(MAX_PATH);

      const state = openMangabaClawStateDatabase({ env });
      const agent = openMangabaClawAgentDatabase({ agentId: AGENT_ID, env });
      expect(state.path).toBe(statePath);
      expect(agent.path).toBe(agentPath);
      expect(
        state.db
          .prepare("SELECT role, schema_version FROM schema_meta WHERE meta_key = 'primary'")
          .get(),
      ).toEqual({ role: "global", schema_version: MANGABACLAW_STATE_SCHEMA_VERSION });
      expect(
        agent.db
          .prepare(
            "SELECT role, schema_version, agent_id FROM schema_meta WHERE meta_key = 'primary'",
          )
          .get(),
      ).toEqual({
        role: "agent",
        schema_version: MANGABACLAW_AGENT_SCHEMA_VERSION,
        agent_id: AGENT_ID,
      });
      closeMangabaClawAgentDatabasesForTest();
      closeMangabaClawStateDatabaseForTest();

      expect(
        withMangabaClawStateDatabaseReadOnly(
          ({ db, path: pathname }) => ({
            pathname,
            version: db.prepare("PRAGMA user_version;").get(),
          }),
          { env },
        ),
      ).toEqual({
        pathname: statePath,
        version: { user_version: MANGABACLAW_STATE_SCHEMA_VERSION },
      });
      expect(
        withMangabaClawAgentDatabaseReadOnly(
          ({ db, path: pathname }) => ({
            pathname,
            version: db.prepare("PRAGMA user_version;").get(),
          }),
          { agentId: AGENT_ID, env },
        ),
      ).toEqual({
        found: true,
        value: {
          pathname: agentPath,
          version: { user_version: MANGABACLAW_AGENT_SCHEMA_VERSION },
        },
      });
      expect(
        preflightMangabaClawDatabaseSchemas({
          env,
          supportedVersions: {
            state: MANGABACLAW_STATE_SCHEMA_VERSION,
            agent: MANGABACLAW_AGENT_SCHEMA_VERSION,
          },
        }),
      ).toEqual({ incompatible: [], indeterminate: [] });
      fs.rmSync(`${statePath}-wal`, { force: true });
      fs.rmSync(`${statePath}-shm`, { force: true });
      const stateBytesBeforeReadOnly = fs.readFileSync(statePath);
      const stateEntriesBeforeReadOnly = fs
        .readdirSync(path.dirname(statePath), { withFileTypes: true })
        .map((entry) => entry.name)
        .toSorted();
      const readOnlyState = await openExistingMangabaClawStateDatabaseReadOnly({ env });
      expect(readOnlyState?.path).toBe(statePath);
      expect(
        readOnlyState?.db
          .prepare("SELECT role, schema_version FROM schema_meta WHERE meta_key = 'primary'")
          .get(),
      ).toEqual({ role: "global", schema_version: MANGABACLAW_STATE_SCHEMA_VERSION });
      const openedStatePath = readOnlyState?.db.prepare("PRAGMA database_list").get() as
        | { file?: unknown }
        | undefined;
      expect(path.resolve(String(openedStatePath?.file))).not.toBe(path.resolve(statePath));
      const privateDirectory = path.dirname(String(openedStatePath?.file));
      expect(readOnlyState?.walMaintenance.close()).toBe(true);
      expect(fs.existsSync(privateDirectory)).toBe(false);
      expect(fs.readFileSync(statePath)).toEqual(stateBytesBeforeReadOnly);
      expect(
        fs
          .readdirSync(path.dirname(statePath), { withFileTypes: true })
          .map((entry) => entry.name)
          .toSorted(),
      ).toEqual(stateEntriesBeforeReadOnly);

      await expect(runDoctorStateSqliteCompact({ env })).resolves.toMatchObject({
        integrityCheck: "ok",
        path: statePath,
        skipped: false,
      });
      expect(
        compactDoctorSessionSqliteTarget(
          {
            agentId: AGENT_ID,
            storePath: path.join(
              env.MANGABACLAW_STATE_DIR ?? "",
              "agents",
              AGENT_ID,
              "sessions",
              "sessions.json",
            ),
          },
          { env },
        ),
      ).toMatchObject({
        freelistAfterPages: 0,
        skipped: false,
        walSizeAfterBytes: 0,
      });

      expect(openMangabaClawStateDatabase({ env }).path).toBe(statePath);
      expect(openMangabaClawAgentDatabase({ agentId: AGENT_ID, env }).path).toBe(agentPath);
    },
  );
});
