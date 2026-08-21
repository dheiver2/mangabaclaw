// E2E coverage for experimental grouped Claw inspection and add planning.
import { execFile } from "node:child_process";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";

const execFileAsync = promisify(execFile);
const tempDirs = useAutoCleanupTempDirTracker(afterEach);

async function runMangabaClaw(
  args: string[],
  options?: { expectFailure?: boolean; stateDir?: string },
) {
  const stateDir = options?.stateDir ?? tempDirs.make("mangabaclaw-claws-lifecycle-e2e-");
  const env = {
    ...process.env,
    HOME: stateDir,
    USERPROFILE: stateDir,
    MANGABACLAW_CONFIG_PATH: join(stateDir, "mangabaclaw.json"),
    MANGABACLAW_EXPERIMENTAL_CLAWS: "1",
    MANGABACLAW_DISABLE_BUNDLED_PLUGINS: "1",
    MANGABACLAW_HOME: stateDir,
    MANGABACLAW_STATE_DIR: stateDir,
    MANGABACLAW_TEST_FAST: "1",
    MANGABACLAW_TEST_RUNTIME_LOG: "1",
    VITEST: "",
  };
  try {
    const result = await execFileAsync(
      process.execPath,
      ["--import", "tsx", "src/entry.ts", ...args],
      { cwd: process.cwd(), env, maxBuffer: 1024 * 1024 },
    );
    if (options?.expectFailure) {
      throw new Error(`expected command to fail: ${args.join(" ")}`);
    }
    return { ok: true as const, stdout: result.stdout, stderr: result.stderr, stateDir };
  } catch (error) {
    if (!options?.expectFailure) {
      const failed = error as Error & { stdout?: string; stderr?: string };
      throw new Error(
        `${failed.message}\nstdout:\n${failed.stdout ?? ""}\nstderr:\n${failed.stderr ?? ""}`,
        { cause: error },
      );
    }
    const failed = error as Error & { stdout?: string; stderr?: string; code?: number };
    return {
      ok: false as const,
      code: failed.code,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? "",
      stateDir,
    };
  }
}

function parseJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  expect(trimmed.length).toBeGreaterThan(0);
  return JSON.parse(trimmed);
}

describe("claws lifecycle cli e2e", () => {
  const manifestPath = "src/claws/fixtures/incident-response.claw.json";

  it("inspects a grouped development manifest", async () => {
    const inspect = parseJson(
      (await runMangabaClaw(["claws", "inspect", manifestPath, "--json"])).stdout,
    );

    expect(inspect).toMatchObject({
      schemaVersion: "mangabaclaw.clawInspect.v1",
      stability: "experimental",
      valid: true,
      source: { kind: "development", version: "0.0.0-development" },
      manifest: {
        schemaVersion: 1,
        agent: { id: "incident-response" },
        packages: expect.any(Array),
      },
      mangabaClawProfile: {
        schemaVersion: 1,
        agent: {
          tools: { allow: ["read", "write", "web_fetch"], deny: ["exec", "browser"] },
          heartbeat: { every: "30m", isolatedSession: true, timeoutSeconds: 120 },
        },
      },
    });
  });

  it("builds a complete package-free read-only plan without network access", async () => {
    const result = await runMangabaClaw([
      "claws",
      "add",
      "src/claws/fixtures/workspace-agent.claw.json",
      "--dry-run",
      "--json",
    ]);
    const add = parseJson(result.stdout);

    expect(add).toMatchObject({
      schemaVersion: "mangabaclaw.clawAddPlan.v1",
      stability: "experimental",
      dryRun: true,
      mutationAllowed: false,
      agent: { requestedId: "workspace-agent", finalId: "workspace-agent" },
      summary: {
        totalActions: 5,
        agentActions: 1,
        workspaceActions: 4,
        packageActions: 0,
        mcpServerActions: 0,
        cronJobActions: 0,
        blockedActions: 0,
      },
      blockers: [],
    });
    expect(result.ok).toBe(true);
  });

  it("preserves implicit main and creates exactly one agent after explicit consent", async () => {
    const preview = await runMangabaClaw([
      "claws",
      "add",
      "src/claws/fixtures/minimal-agent.claw.json",
      "--dry-run",
      "--json",
    ]);
    const plan = parseJson(preview.stdout) as { planIntegrity: string };
    const result = await runMangabaClaw(
      [
        "claws",
        "add",
        "src/claws/fixtures/minimal-agent.claw.json",
        "--yes",
        "--plan-integrity",
        plan.planIntegrity,
        "--json",
      ],
      { stateDir: preview.stateDir },
    );

    expect(parseJson(result.stdout)).toMatchObject({
      schemaVersion: "mangabaclaw.clawAddResult.v1",
      stability: "experimental",
      status: "complete",
      agent: { finalId: "internal-triage" },
      workspaceCreated: true,
      configCommitted: true,
      installRecord: { agentId: "internal-triage", status: "complete" },
    });
    const config = JSON.parse(await readFile(join(result.stateDir, "mangabaclaw.json"), "utf8"));
    const canonicalStateDir = await realpath(result.stateDir);
    expect(config.agents.entries).toEqual({
      main: { workspace: join(canonicalStateDir, "workspace") },
      "internal-triage": expect.objectContaining({
        name: "Internal Triage",
        tools: { deny: ["exec", "browser"] },
        humanDelay: { mode: "natural" },
        workspace: join(canonicalStateDir, ".mangabaclaw", "workspace-internal-triage"),
      }),
    });
  });

  it("creates declared bootstrap and supporting files in the new workspace", async () => {
    const preview = await runMangabaClaw([
      "claws",
      "add",
      "src/claws/fixtures/workspace-agent.claw.json",
      "--dry-run",
      "--json",
    ]);
    const plan = parseJson(preview.stdout) as { planIntegrity: string };
    const result = await runMangabaClaw(
      [
        "claws",
        "add",
        "src/claws/fixtures/workspace-agent.claw.json",
        "--yes",
        "--plan-integrity",
        plan.planIntegrity,
        "--json",
      ],
      { stateDir: preview.stateDir },
    );
    const payload = parseJson(result.stdout);
    const workspace = join(
      await realpath(result.stateDir),
      ".mangabaclaw",
      "workspace-workspace-agent",
    );

    expect(payload).toMatchObject({
      schemaVersion: "mangabaclaw.clawAddResult.v1",
      status: "complete",
      agent: { finalId: "workspace-agent", workspace },
      workspaceFiles: [
        expect.objectContaining({ path: "SOUL.md" }),
        expect.objectContaining({ path: "HEARTBEAT.md" }),
        expect.objectContaining({ path: "reference/policy.md" }),
      ],
      installRecord: { agentId: "workspace-agent", status: "complete" },
    });
    await expect(readFile(join(workspace, "SOUL.md"), "utf8")).resolves.toContain(
      "Incident Response",
    );
    await expect(readFile(join(workspace, "HEARTBEAT.md"), "utf8")).resolves.toContain(
      "Incident Heartbeat",
    );
    await expect(readFile(join(workspace, "reference", "policy.md"), "utf8")).resolves.toContain(
      "operator settings",
    );
  });

  it("reports and removes a Claw-created agent through plan-first lifecycle commands", async () => {
    const addPreview = await runMangabaClaw([
      "claws",
      "add",
      "src/claws/fixtures/workspace-agent.claw.json",
      "--dry-run",
      "--json",
    ]);
    const addPlan = parseJson(addPreview.stdout) as { planIntegrity: string };
    const added = await runMangabaClaw(
      [
        "claws",
        "add",
        "src/claws/fixtures/workspace-agent.claw.json",
        "--yes",
        "--plan-integrity",
        addPlan.planIntegrity,
        "--json",
      ],
      { stateDir: addPreview.stateDir },
    );
    const status = await runMangabaClaw(["claws", "status", "workspace-agent", "--json"], {
      stateDir: added.stateDir,
    });
    expect(parseJson(status.stdout)).toMatchObject({
      schemaVersion: "mangabaclaw.clawStatus.v1",
      summary: { claws: 1, driftedFiles: 0 },
      records: [{ install: { agentId: "workspace-agent" }, agentState: "present" }],
    });

    const preview = await runMangabaClaw(
      ["claws", "remove", "workspace-agent", "--dry-run", "--json"],
      { stateDir: added.stateDir },
    );
    const removePlan = parseJson(preview.stdout) as { planIntegrity: string };
    expect(removePlan).toMatchObject({
      schemaVersion: "mangabaclaw.clawRemovePlan.v1",
      mutationAllowed: false,
      agentId: "workspace-agent",
      blockers: [],
    });

    const removed = await runMangabaClaw(
      [
        "claws",
        "remove",
        "workspace-agent",
        "--yes",
        "--plan-integrity",
        removePlan.planIntegrity,
        "--json",
      ],
      { stateDir: added.stateDir },
    );
    expect(parseJson(removed.stdout)).toMatchObject({
      schemaVersion: "mangabaclaw.clawRemoveResult.v1",
      status: "complete",
      agentId: "workspace-agent",
      agentRemoved: true,
    });
    const config = JSON.parse(await readFile(join(added.stateDir, "mangabaclaw.json"), "utf8"));
    const canonicalStateDir = await realpath(added.stateDir);
    expect(config.agents).toEqual({
      defaults: {
        heartbeat: { agentId: "main" },
        systemAgent: { agentId: "main" },
      },
      entries: { main: { workspace: join(canonicalStateDir, "workspace") } },
    });
  });

  it("exports an installed agent as a self-contained grouped package", async () => {
    const source = "src/claws/fixtures/workspace-agent.claw.json";
    const addPreview = await runMangabaClaw(["claws", "add", source, "--dry-run", "--json"]);
    const addPlan = parseJson(addPreview.stdout) as { planIntegrity: string };
    const added = await runMangabaClaw(
      ["claws", "add", source, "--yes", "--plan-integrity", addPlan.planIntegrity, "--json"],
      { stateDir: addPreview.stateDir },
    );
    const outputDirectory = join(added.stateDir, "exported-claw");
    const exported = await runMangabaClaw(
      ["claws", "export", "workspace-agent", "--out", outputDirectory, "--json"],
      { stateDir: added.stateDir },
    );
    expect(parseJson(exported.stdout)).toMatchObject({
      schemaVersion: "mangabaclaw.clawExportResult.v1",
      stability: "experimental",
      agentId: "workspace-agent",
      outputDirectory,
      manifest: {
        schemaVersion: 1,
        agent: { id: "workspace-agent" },
        workspace: {
          bootstrapFiles: {
            "HEARTBEAT.md": { source: "workspace/HEARTBEAT.md" },
          },
          files: [
            {
              source: "workspace/reference/policy.md",
              path: "reference/policy.md",
            },
          ],
        },
      },
    });
    expect(JSON.parse(await readFile(join(outputDirectory, "package.json"), "utf8"))).toMatchObject(
      {
        name: "mangabaclaw-claw-workspace-agent",
        version: expect.stringMatching(/^0\.0\.0-export\.[0-9a-f]{64}$/),
        type: "module",
      },
    );
    await expect(readFile(join(outputDirectory, "CLAW.md"), "utf8")).resolves.toContain(
      "Incident Response",
    );
    const inspected = await runMangabaClaw(["claws", "inspect", outputDirectory, "--json"]);
    expect(parseJson(inspected.stdout)).toMatchObject({
      valid: true,
      source: { kind: "package" },
      manifest: { agent: { id: "workspace-agent" } },
    });
    const roundTripPreview = await runMangabaClaw([
      "claws",
      "add",
      outputDirectory,
      "--dry-run",
      "--json",
    ]);
    const roundTripPlan = parseJson(roundTripPreview.stdout) as { planIntegrity: string };
    const roundTrip = await runMangabaClaw(
      [
        "claws",
        "add",
        outputDirectory,
        "--yes",
        "--plan-integrity",
        roundTripPlan.planIntegrity,
        "--json",
      ],
      { stateDir: roundTripPreview.stateDir },
    );
    expect(parseJson(roundTrip.stdout)).toMatchObject({
      status: "complete",
      claw: { kind: "package" },
      agent: { finalId: "workspace-agent" },
      workspaceFiles: [
        expect.objectContaining({ path: "SOUL.md" }),
        expect.objectContaining({ path: "HEARTBEAT.md" }),
        expect.objectContaining({ path: "reference/policy.md" }),
      ],
    });
  });

  it("blocks mutation when declared components need later lifecycle slices", async () => {
    const root = tempDirs.make("mangabaclaw-claws-deferred-components-");
    const deferredManifestPath = join(root, "deferred.claw.json");
    await writeFile(
      deferredManifestPath,
      JSON.stringify({
        schemaVersion: 1,
        agent: { id: "deferred-components" },
        mcpServers: { status: { command: "status-mcp" } },
        cronJobs: [
          {
            id: "status-check",
            schedule: { cron: "0 * * * *", timezone: "UTC" },
            session: "isolated",
            message: "Check status",
          },
        ],
      }),
      "utf8",
    );
    const preview = await runMangabaClaw([
      "claws",
      "add",
      deferredManifestPath,
      "--dry-run",
      "--json",
    ]);
    const plan = parseJson(preview.stdout) as { planIntegrity: string };
    const result = await runMangabaClaw(
      [
        "claws",
        "add",
        deferredManifestPath,
        "--yes",
        "--plan-integrity",
        plan.planIntegrity,
        "--json",
      ],
      {
        expectFailure: true,
        stateDir: preview.stateDir,
      },
    );

    expect(result.code).toBe(1);
    expect(parseJson(result.stdout)).toMatchObject({
      schemaVersion: "mangabaclaw.clawAddResult.v1",
      status: "partial",
      configCommitted: true,
      error: { code: "cron_install_failed" },
      installRecord: { status: "config_committed" },
    });
  });

  it("fails closed when add is invoked without dry-run or consent", async () => {
    const result = await runMangabaClaw(["claws", "add", manifestPath], {
      expectFailure: true,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Claw add requires explicit consent");
  });
});
