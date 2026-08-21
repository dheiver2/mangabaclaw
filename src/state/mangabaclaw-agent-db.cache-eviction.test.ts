// Agent database cache tests cover bounded process-local SQLite handle ownership.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeMangabaClawAgentDatabaseByPath,
  closeMangabaClawAgentDatabasesForTest,
  disposeMangabaClawAgentDatabaseByPath,
  isMangabaClawAgentDatabaseOpen,
  listMangabaClawAgentDatabasesForTest,
  listMangabaClawRegisteredAgentDatabases,
  MANGABACLAW_AGENT_DB_OPEN_HANDLE_CAP,
  openMangabaClawAgentDatabase,
} from "./mangabaclaw-agent-db.js";
import { closeMangabaClawStateDatabaseForTest } from "./mangabaclaw-state-db.js";

const BASE_AGENT_IDS = Array.from(
  { length: MANGABACLAW_AGENT_DB_OPEN_HANDLE_CAP },
  (_, index) => `fixture-${index}`,
);
const BASE_AGENT_ID_SET = new Set(BASE_AGENT_IDS);

let fixtureEnv: NodeJS.ProcessEnv | undefined;
let fixtureStateDir: string | undefined;
let baseDatabases: ReturnType<typeof openMangabaClawAgentDatabase>[] = [];

function requireFixtureEnv(): NodeJS.ProcessEnv {
  if (!fixtureEnv) {
    throw new Error("agent database cache fixture was not initialized");
  }
  return fixtureEnv;
}

function restoreBaseCache(): void {
  const env = requireFixtureEnv();
  for (const database of listMangabaClawAgentDatabasesForTest()) {
    if (!BASE_AGENT_ID_SET.has(database.agentId)) {
      closeMangabaClawAgentDatabaseByPath(database.path);
    }
  }
  baseDatabases = BASE_AGENT_IDS.map((agentId) => openMangabaClawAgentDatabase({ agentId, env }));
}

function closeFirstBaseHandle(): void {
  const first = baseDatabases[0];
  if (!first || !closeMangabaClawAgentDatabaseByPath(first.path)) {
    throw new Error("first base agent database was not open");
  }
}

function evictAfterRefreshingBaseHandles(evictorAgentId: string, env: NodeJS.ProcessEnv): void {
  for (const database of baseDatabases.slice(1)) {
    openMangabaClawAgentDatabase({ agentId: database.agentId, env });
  }
  openMangabaClawAgentDatabase({ agentId: evictorAgentId, env });
}

beforeAll(() => {
  closeMangabaClawAgentDatabasesForTest();
  fixtureStateDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-agent-db-cache-")),
  );
  fixtureEnv = { MANGABACLAW_STATE_DIR: fixtureStateDir };
  restoreBaseCache();
});

beforeEach(() => {
  // Reopen only the base handle evicted by the previous case, then refresh cache order by hits.
  restoreBaseCache();
});

afterAll(() => {
  closeMangabaClawAgentDatabasesForTest();
  closeMangabaClawStateDatabaseForTest();
  if (fixtureStateDir) {
    fs.rmSync(fixtureStateDir, { force: true, recursive: true });
  }
});

describe("mangabaclaw agent database handle cache", () => {
  it("keeps only the capped number of open handles", () => {
    const env = requireFixtureEnv();
    const databases = [
      ...baseDatabases,
      openMangabaClawAgentDatabase({ agentId: "cap-overflow", env }),
    ];
    const leastRecentlyUsed = databases[0]!;

    expect(databases.filter((database) => database.db.isOpen)).toHaveLength(
      MANGABACLAW_AGENT_DB_OPEN_HANDLE_CAP,
    );
    expect(isMangabaClawAgentDatabaseOpen(leastRecentlyUsed.path)).toBe(false);
    expect(leastRecentlyUsed.db.isOpen).toBe(false);
  });

  it("refreshes cache-hit recency before evicting the true LRU handle", () => {
    const env = requireFixtureEnv();
    const recentlyUsed = baseDatabases[0]!;
    const leastRecentlyUsed = baseDatabases[1]!;

    expect(openMangabaClawAgentDatabase({ agentId: recentlyUsed.agentId, env })).toBe(recentlyUsed);
    openMangabaClawAgentDatabase({ agentId: "recency-newest", env });

    expect(recentlyUsed.db.isOpen).toBe(true);
    expect(isMangabaClawAgentDatabaseOpen(recentlyUsed.path)).toBe(true);
    expect(leastRecentlyUsed.db.isOpen).toBe(false);
    expect(isMangabaClawAgentDatabaseOpen(leastRecentlyUsed.path)).toBe(false);
  });

  it("never evicts an LRU handle with an open transaction", () => {
    const env = requireFixtureEnv();
    const transactionOwner = baseDatabases[0]!;
    transactionOwner.db.exec("BEGIN IMMEDIATE");
    try {
      const leastRecentlyUsed = baseDatabases[1]!;
      openMangabaClawAgentDatabase({ agentId: "transaction-newest", env });

      expect(transactionOwner.db.isOpen).toBe(true);
      expect(transactionOwner.db.isTransaction).toBe(true);
      expect(isMangabaClawAgentDatabaseOpen(transactionOwner.path)).toBe(true);
      expect(leastRecentlyUsed.db.isOpen).toBe(false);
      expect(isMangabaClawAgentDatabaseOpen(leastRecentlyUsed.path)).toBe(false);
    } finally {
      transactionOwner.db.exec("ROLLBACK");
    }
  });

  it("reopens an evicted database without losing durable rows", () => {
    const env = requireFixtureEnv();
    const evicted = baseDatabases[0]!;
    evicted.db
      .prepare(
        "INSERT INTO auth_profile_state (state_key, state_json, updated_at) VALUES (?, ?, ?)",
      )
      .run("cache-eviction", JSON.stringify({ preserved: true }), 42);

    openMangabaClawAgentDatabase({ agentId: "durability-evictor", env });
    expect(evicted.db.isOpen).toBe(false);

    const reopened = openMangabaClawAgentDatabase({ agentId: evicted.agentId, env });
    expect(reopened).not.toBe(evicted);
    expect(
      reopened.db
        .prepare("SELECT state_json, updated_at FROM auth_profile_state WHERE state_key = ?")
        .get("cache-eviction"),
    ).toEqual({ state_json: JSON.stringify({ preserved: true }), updated_at: 42 });
  });

  it("registers a first open without refreshing registry metadata after eviction", () => {
    const env = requireFixtureEnv();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    try {
      closeFirstBaseHandle();
      const evicted = openMangabaClawAgentDatabase({ agentId: "evicted", env });
      expect(
        listMangabaClawRegisteredAgentDatabases({ env }).find(
          (entry) => entry.agentId === "evicted" && entry.path === evicted.path,
        ),
      ).toMatchObject({ lastSeenAt: 1_000 });

      nowSpy.mockReturnValue(2_000);
      evictAfterRefreshingBaseHandles("registry-evictor", env);
      expect(evicted.db.isOpen).toBe(false);

      openMangabaClawAgentDatabase({ agentId: "evicted", env });
      expect(
        listMangabaClawRegisteredAgentDatabases({ env }).find(
          (entry) => entry.agentId === "evicted" && entry.path === evicted.path,
        ),
      ).toMatchObject({ lastSeenAt: 1_000 });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("validates ownership when an evicted path is requested for another agent", () => {
    const env = requireFixtureEnv();
    closeFirstBaseHandle();
    const evicted = openMangabaClawAgentDatabase({ agentId: "worker-a", env });
    evictAfterRefreshingBaseHandles("ownership-evictor", env);
    expect(evicted.db.isOpen).toBe(false);

    expect(() =>
      openMangabaClawAgentDatabase({ agentId: "worker-b", env, path: evicted.path }),
    ).toThrow(/belongs to agent worker-a/);
  });

  it("revalidates and registers a database after explicit disposal", () => {
    const env = requireFixtureEnv();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    try {
      const disposed = openMangabaClawAgentDatabase({ agentId: "disposed", env });
      expect(
        listMangabaClawRegisteredAgentDatabases({ env }).find(
          (entry) => entry.agentId === "disposed" && entry.path === disposed.path,
        ),
      ).toMatchObject({ lastSeenAt: 1_000 });

      expect(disposeMangabaClawAgentDatabaseByPath(disposed.path, { env })).toBe(true);
      expect(
        listMangabaClawRegisteredAgentDatabases({ env }).some(
          (entry) => entry.agentId === "disposed" && entry.path === disposed.path,
        ),
      ).toBe(false);

      nowSpy.mockReturnValue(2_000);
      openMangabaClawAgentDatabase({ agentId: "disposed", env, path: disposed.path });
      expect(
        listMangabaClawRegisteredAgentDatabases({ env }).find(
          (entry) => entry.agentId === "disposed" && entry.path === disposed.path,
        ),
      ).toMatchObject({ lastSeenAt: 2_000 });
    } finally {
      nowSpy.mockRestore();
    }
  });
});
