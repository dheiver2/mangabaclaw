import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../infra/kysely-sync.js";
import { withMangabaClawTestState } from "../test-utils/mangabaclaw-test-state.js";
import type { DB as MangabaClawStateKyselyDatabase } from "./mangabaclaw-state-db.generated.js";
import {
  closeMangabaClawStateDatabaseForTest,
  runMangabaClawStateWriteTransaction,
} from "./mangabaclaw-state-db.js";
import { withMangabaClawStateLease } from "./mangabaclaw-state-lease.js";

type LeaseDatabase = Pick<MangabaClawStateKyselyDatabase, "state_leases">;

afterEach(() => {
  closeMangabaClawStateDatabaseForTest();
});

describe("MangabaClaw state lease", () => {
  it("releases ownership when a CLI exits from inside the leased operation", async () => {
    await withMangabaClawTestState({ label: "core-state-lease-process-exit" }, async (state) => {
      const leaseModuleUrl = pathToFileURL(path.resolve("src/state/mangabaclaw-state-lease.ts")).href;
      const childScript = await state.writeText(
        "lease-process-exit-child.mts",
        `
          import { withMangabaClawStateLease } from ${JSON.stringify(leaseModuleUrl)};
          const stateDir = process.argv[2];
          await withMangabaClawStateLease({
            scope: "core:test",
            key: "process-exit",
            database: { scope: "shared", options: { env: { ...process.env, MANGABACLAW_STATE_DIR: stateDir } } },
            leaseMs: 300_000,
            waitMs: 0,
          }, async () => process.exit(23));
        `,
      );

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", childScript, state.stateDir], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout.on("data", (chunk) => (output += chunk));
        child.stderr.on("data", (chunk) => (output += chunk));
        child.on("error", reject);
        child.on("close", (code) => {
          if (code !== 23) {
            reject(new Error(`lease child exited ${code}: ${output}`));
            return;
          }
          resolve(code);
        });
      });
      expect(exitCode).toBe(23);

      let reacquired = false;
      await withMangabaClawStateLease(
        {
          scope: "core:test",
          key: "process-exit",
          database: { scope: "shared", options: { env: state.env } },
          leaseMs: 1_000,
          waitMs: 0,
        },
        async () => {
          reacquired = true;
        },
      );
      expect(reacquired).toBe(true);
    });
  });

  it("keeps state database exit-cleanup diagnostics off stdout for machine-readable output", async () => {
    await withMangabaClawTestState({ label: "core-state-lease-exit-stdout" }, async (state) => {
      const leaseModuleUrl = pathToFileURL(path.resolve("src/state/mangabaclaw-state-lease.ts")).href;
      const stateDbModuleUrl = pathToFileURL(path.resolve("src/state/mangabaclaw-state-db.ts")).href;
      const loggingStateModuleUrl = pathToFileURL(path.resolve("src/logging/state.ts")).href;
      const childScript = await state.writeText(
        "lease-exit-stdout-child.mts",
        `
          import { withMangabaClawStateLease } from ${JSON.stringify(leaseModuleUrl)};
          import {
            closeMangabaClawStateDatabaseForTest,
            openMangabaClawStateDatabase,
          } from ${JSON.stringify(stateDbModuleUrl)};
          import { loggingState } from ${JSON.stringify(loggingStateModuleUrl)};
          const stateDir = process.argv[2];
          const env = { ...process.env, MANGABACLAW_STATE_DIR: stateDir };
          // Simulate --json console routing being active for the command.
          loggingState.forceConsoleToStderr = true;
          await withMangabaClawStateLease({
            scope: "core:test",
            key: "exit-stdout",
            database: { scope: "shared", options: { env } },
            leaseMs: 300_000,
            waitMs: 0,
          }, async () => {
            // Recreate the pending-migration condition for the exit-time reopen.
            const { db } = openMangabaClawStateDatabase({ env });
            db.exec("PRAGMA user_version = 0;");
            closeMangabaClawStateDatabaseForTest();
            // Simulate the JSON envelope followed by restored output routing.
            // Await the write callback — stdout is piped in the test harness, so
            // a bare write() can drop the data before process.exit flushes.
            await new Promise<void>((resolve) => {
              process.stdout.write(JSON.stringify({ ok: true }) + "\\n", resolve);
            });
            loggingState.forceConsoleToStderr = false;
            process.exit(23);
          });
        `,
      );

      const childResult = await new Promise<{
        code: number | null;
        stdout: string;
        stderr: string;
      }>((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", childScript, state.stateDir], {
          // Keep console logging enabled in the child despite the inherited VITEST env.
          env: { ...process.env, MANGABACLAW_TEST_CONSOLE: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout, stderr }));
      });

      expect(
        childResult.code,
        `lease child exited ${childResult.code}: ${childResult.stderr}`,
      ).toBe(23);
      // The exit-time lease release reopens the state database and hits the
      // pending-migration diagnostic; stdout must stay machine-readable.
      expect(childResult.stdout).toBe(`${JSON.stringify({ ok: true })}\n`);
      expect(childResult.stderr).toContain("state database schema migration pending");
    });
  }, 60_000);

  it("rechecks exact ownership inside the caller's write transaction", async () => {
    await withMangabaClawTestState({ label: "core-state-lease" }, async () => {
      await expect(
        withMangabaClawStateLease(
          {
            scope: "core:test",
            key: "credential-write",
            database: { scope: "shared" },
            leaseMs: 1_000,
            waitMs: 0,
          },
          async (lease) => {
            runMangabaClawStateWriteTransaction(({ db }) => {
              lease.assertOwnedInTransaction(db);
              executeSqliteQuerySync(
                db,
                getNodeSqliteKysely<LeaseDatabase>(db)
                  .updateTable("state_leases")
                  .set({ owner: "successor" })
                  .where("scope", "=", "core:test")
                  .where("lease_key", "=", "credential-write"),
              );
              expect(() => lease.assertOwnedInTransaction(db)).toThrowError(
                expect.objectContaining({ code: "MANGABACLAW_STATE_LEASE_LOST" }),
              );
            });
          },
        ),
      ).rejects.toMatchObject({ code: "MANGABACLAW_STATE_LEASE_LOST" });
    });
  });
});
