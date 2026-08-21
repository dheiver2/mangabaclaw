import { expectDefined } from "@mangabaclaw/normalization-core";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupTempDirs, makeTempDir } from "../../../test/helpers/temp-dir.js";
import { listAuditEvents, recordAuditEvent } from "../../audit/audit-event-store.js";
import {
  closeMangabaClawStateDatabaseForTest,
  type MangabaClawStateDatabaseOptions,
} from "../../state/mangabaclaw-state-db.js";
import { auditHandlers } from "./audit.js";

const tempDirs: string[] = [];

function createDatabaseOptions(): MangabaClawStateDatabaseOptions {
  return { env: { MANGABACLAW_STATE_DIR: makeTempDir(tempDirs, "mangabaclaw-audit-trim-") } };
}

afterEach(() => {
  closeMangabaClawStateDatabaseForTest();
  delete process.env.MANGABACLAW_STATE_DIR;
});

afterAll(() => {
  cleanupTempDirs(tempDirs);
});

describe("audit.list padded filters against a real audit store", () => {
  it("returns the planted run for padded agentId/runId filters", async () => {
    const database = createDatabaseOptions();
    const stateDir = expectDefined(database.env?.MANGABACLAW_STATE_DIR, "temp state dir");
    process.env.MANGABACLAW_STATE_DIR = stateDir;

    recordAuditEvent(
      {
        sourceId: "audit-trim-run-source",
        sourceSequence: 1,
        occurredAt: Date.now(),
        kind: "agent_run",
        action: "agent.run.finished",
        status: "succeeded",
        actorType: "agent",
        actorId: "main",
        agentId: "main",
        sessionKey: "agent:main:main",
        runId: "run-trim-1",
      },
      database,
    );

    // Negative control: untrimmed filter values miss the planted row at the store.
    expect(
      listAuditEvents({
        limit: 20,
        filters: { agentId: " main ", runId: " run-trim-1 " },
        database,
      }).events,
    ).toEqual([]);

    const respond = vi.fn();
    await expectDefined(
      auditHandlers["audit.list"],
      "audit.list handler",
    )({
      params: {
        agentId: " main ",
        sessionKey: " agent:main:main ",
        runId: " run-trim-1 ",
      },
      respond,
    } as never);

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        events: [
          expect.objectContaining({
            agentId: "main",
            runId: "run-trim-1",
            action: "agent.run.finished",
          }),
        ],
      }),
    );
  });
});
