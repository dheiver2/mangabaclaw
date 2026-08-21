// Covers the session-registry sweep's cron-store failure behavior: an
// unreadable cron store must skip the sweep, not prune running transcripts.
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfigRuntimeState } from "../config/config.js";
import { loadSessionEntry, replaceSessionEntry } from "../config/sessions/session-accessor.js";
import { closeMangabaClawAgentDatabasesForTest } from "../state/mangabaclaw-agent-db.js";
import { withMangabaClawTestState } from "../test-utils/mangabaclaw-test-state.js";
import { runSessionRegistryMaintenance } from "./tasks-session-registry-maintenance.js";

const mocks = vi.hoisted(() => ({
  cronStoreLoadError: undefined as Error | undefined,
}));

vi.mock("../cron/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cron/store.js")>();
  return {
    ...actual,
    loadCronJobsStoreSync: (storePath: string) => {
      if (mocks.cronStoreLoadError) {
        throw mocks.cronStoreLoadError;
      }
      return actual.loadCronJobsStoreSync(storePath);
    },
  };
});

describe("runSessionRegistryMaintenance", () => {
  afterEach(() => {
    mocks.cronStoreLoadError = undefined;
    resetConfigRuntimeState();
    closeMangabaClawAgentDatabasesForTest();
  });

  it("skips the sweep instead of pruning when the cron store is unreadable", async () => {
    await withMangabaClawTestState(
      { layout: "state-only", prefix: "mangabaclaw-session-registry-maintenance-" },
      async (state) => {
        resetConfigRuntimeState();
        const storePath = path.join(state.sessionsDir("main"), "sessions.json");
        const staleCronKey = "agent:main:cron:maybe-running:run:old-run";
        await replaceSessionEntry(
          { sessionKey: staleCronKey, storePath },
          { sessionId: "maybe-running", updatedAt: Date.now() - 8 * 24 * 60 * 60_000 },
        );
        mocks.cronStoreLoadError = new Error("SQLITE_CORRUPT: database disk image is malformed");

        const summary = await runSessionRegistryMaintenance({ apply: true });

        expect(summary.skippedReason).toContain("cron store unreadable");
        expect(summary.pruned).toBe(0);
        // The possibly-running cron transcript survives until cron facts are readable.
        expect(loadSessionEntry({ sessionKey: staleCronKey, storePath })).toBeDefined();
      },
    );
  });

  it("prunes stale rows when the cron store is readable", async () => {
    await withMangabaClawTestState(
      { layout: "state-only", prefix: "mangabaclaw-session-registry-maintenance-" },
      async (state) => {
        resetConfigRuntimeState();
        const storePath = path.join(state.sessionsDir("main"), "sessions.json");
        const staleKey = "agent:main:cron:done-job:run:old-run";
        await replaceSessionEntry(
          { sessionKey: staleKey, storePath },
          { sessionId: "old-run", updatedAt: Date.now() - 8 * 24 * 60 * 60_000 },
        );

        const summary = await runSessionRegistryMaintenance({ apply: true });

        expect(summary.skippedReason).toBeUndefined();
        expect(summary.pruned).toBe(1);
        expect(loadSessionEntry({ sessionKey: staleKey, storePath })).toBeUndefined();
      },
    );
  });
});
