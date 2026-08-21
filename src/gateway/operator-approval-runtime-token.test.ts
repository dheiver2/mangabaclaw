import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecApprovalsFile } from "../infra/exec-approvals-core.js";
import { saveExecApprovals } from "../infra/exec-approvals-store.js";
import { testing as execApprovalsStoreTesting } from "../infra/exec-approvals-store.test-support.js";
import { closeMangabaClawStateDatabaseForTest } from "../state/mangabaclaw-state-db.js";
import { captureEnv, setTestEnvValue } from "../test-utils/env.js";

const envSnapshot = captureEnv(["HOME", "MANGABACLAW_HOME", "MANGABACLAW_STATE_DIR"]);

const tempHomes: string[] = [];

function useTempHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-approval-runtime-"));
  tempHomes.push(home);
  setTestEnvValue("HOME", home);
  setTestEnvValue("MANGABACLAW_HOME", home);
  setTestEnvValue("MANGABACLAW_STATE_DIR", path.join(home, ".mangabaclaw"));
  closeMangabaClawStateDatabaseForTest();
  execApprovalsStoreTesting.reset();
  return home;
}

function execApprovalsPath(home: string): string {
  return path.join(home, ".mangabaclaw", "exec-approvals.json");
}

function writeExecApprovalsToken(_home: string, token: string): void {
  saveExecApprovals({
    version: 1,
    socket: {
      path: "~/.mangabaclaw/exec-approvals.sock",
      token,
    },
    agents: {},
  } satisfies ExecApprovalsFile);
}

async function importRuntimeTokenModule(): Promise<
  typeof import("./operator-approval-runtime-token.js")
> {
  vi.resetModules();
  return await import("./operator-approval-runtime-token.js");
}

afterEach(() => {
  closeMangabaClawStateDatabaseForTest();
  execApprovalsStoreTesting.reset();
  vi.resetModules();
  envSnapshot.restore();
  for (const home of tempHomes.splice(0)) {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

describe("operator approval runtime token", () => {
  it("derives the shared approval runtime token from the exec approvals socket token", async () => {
    const home = useTempHome();
    writeExecApprovalsToken(home, "shared-runtime-token");

    const runtimeToken = await importRuntimeTokenModule();
    const sharedToken = runtimeToken.getOperatorApprovalRuntimeToken();

    expect(sharedToken).toEqual(expect.any(String));
    expect(sharedToken).not.toBe("shared-runtime-token");
    expect(runtimeToken.isOperatorApprovalRuntimeToken(` ${sharedToken} `)).toBe(true);
    expect(runtimeToken.isOperatorApprovalRuntimeToken(sharedToken.slice(0, -1))).toBe(false);
    expect(runtimeToken.isOperatorApprovalRuntimeToken("shared-runtime-token")).toBe(false);
    expect(runtimeToken.isOperatorApprovalRuntimeToken("different-token")).toBe(false);
  });

  it("does not pin the process fallback once a shared exec approvals token appears", async () => {
    const home = useTempHome();
    const runtimeToken = await importRuntimeTokenModule();

    const fallback = runtimeToken.getOperatorApprovalRuntimeToken();
    writeExecApprovalsToken(home, "late-shared-runtime-token");
    const sharedToken = runtimeToken.getOperatorApprovalRuntimeToken();

    expect(sharedToken).not.toBe(fallback);
    expect(sharedToken).not.toBe("late-shared-runtime-token");
    expect(runtimeToken.isOperatorApprovalRuntimeToken(fallback)).toBe(true);
    expect(runtimeToken.isOperatorApprovalRuntimeToken(sharedToken)).toBe(true);
    expect(runtimeToken.isOperatorApprovalRuntimeToken("late-shared-runtime-token")).toBe(false);
  });

  it("keeps a stable process fallback without creating exec-approvals.json", async () => {
    const home = useTempHome();
    const runtimeToken = await importRuntimeTokenModule();

    const first = runtimeToken.getOperatorApprovalRuntimeToken();
    const second = runtimeToken.getOperatorApprovalRuntimeToken();

    expect(first).toEqual(expect.any(String));
    expect(second).toBe(first);
    expect(fs.existsSync(execApprovalsPath(home))).toBe(false);
  });
});
