import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { buildClawAddPlan } from "../claws/lifecycle.js";
import { persistClawInstallRecord } from "../claws/provenance.js";
import { readClawManifestFile } from "../claws/reader.js";
import {
  closeMangabaClawStateDatabaseForTest,
  openMangabaClawStateDatabase,
} from "../state/mangabaclaw-state-db.js";

const mocks = vi.hoisted(() => ({
  logs: [] as string[],
  runtime: {
    log: vi.fn(),
    error: vi.fn(),
    writeJson: vi.fn((value: unknown) => mocks.logs.push(JSON.stringify(value))),
    writeStdout: vi.fn(),
    exit: vi.fn((code: number) => {
      throw new Error(`__exit__:${code}`);
    }),
  },
  loadConfig: vi.fn<() => Record<string, unknown>>(() => ({})),
  listConfiguredMcpServers: vi.fn(),
  applyClawAddPlan: vi.fn(),
  preflightClawPackage: vi.fn(),
}));

vi.mock("../runtime.js", async () => ({
  ...(await vi.importActual<typeof import("../runtime.js")>("../runtime.js")),
  defaultRuntime: mocks.runtime,
  writeRuntimeJson: (runtime: typeof mocks.runtime, value: unknown) => runtime.writeJson(value),
}));
vi.mock("../config/config.js", async () => ({
  ...(await vi.importActual<typeof import("../config/config.js")>("../config/config.js")),
  getRuntimeConfig: mocks.loadConfig,
}));
vi.mock("../config/mcp-config.js", () => ({
  listConfiguredMcpServers: mocks.listConfiguredMcpServers,
}));
vi.mock("../claws/add.js", async () => ({
  ...(await vi.importActual<typeof import("../claws/add.js")>("../claws/add.js")),
  applyClawAddPlan: mocks.applyClawAddPlan,
}));
vi.mock("../claws/packages.js", async () => ({
  ...(await vi.importActual<typeof import("../claws/packages.js")>("../claws/packages.js")),
  preflightClawPackage: mocks.preflightClawPackage,
}));

const { runClawsAddCommand } = await import("./claws-cli.runtime.js");
const tempDirs = useAutoCleanupTempDirTracker(afterEach);

beforeEach(() => {
  vi.stubEnv("MANGABACLAW_EXPERIMENTAL_CLAWS", "1");
  mocks.logs.length = 0;
  mocks.loadConfig.mockReset();
  mocks.listConfiguredMcpServers.mockResolvedValue({ ok: true, path: "config", mcpServers: {} });
  mocks.applyClawAddPlan.mockReset();
  mocks.applyClawAddPlan.mockResolvedValue({
    schemaVersion: "mangabaclaw.clawAddResult.v1",
    stability: "experimental",
    status: "complete",
    agent: { finalId: "demo-agent", workspace: "" },
  });
});

afterEach(() => {
  closeMangabaClawStateDatabaseForTest();
  vi.unstubAllEnvs();
});

describe("claws add legacy v1 resume", () => {
  it.each(["coding", "minimal"] as const)(
    "retries an exact committed dynamic %s-profile add through the bounded migration",
    async (toolProfile) => {
      const root = tempDirs.make("mangabaclaw-claws-v1-profile-resume-");
      const workspace = join(root, "workspace");
      vi.stubEnv("MANGABACLAW_STATE_DIR", join(tempDirs.make("mangabaclaw-state-"), "state"));
      await mkdir(join(root, "profiles"));
      const manifestPath = join(root, "mangabaclaw.claw.json");
      await writeFile(
        manifestPath,
        JSON.stringify({ schemaVersion: 1, agent: { id: "demo-agent", name: "Demo Agent" } }),
        "utf8",
      );
      await writeFile(
        join(root, "profiles", "mangabaclaw.yml"),
        `schemaVersion: 1\nagent:\n  tools:\n    profile: ${toolProfile}\n`,
        "utf8",
      );
      const read = await readClawManifestFile(manifestPath, {
        allowLegacyDynamicToolProfile: true,
      });
      if (!read.ok || !read.legacyMangabaClawProfile) {
        throw new Error("expected legacy dynamic profile evidence");
      }
      const legacyPlan = await buildClawAddPlan({
        manifest: read.manifest,
        mangabaClawProfile: read.legacyMangabaClawProfile,
        reconstructLegacyDynamicToolProfilePlan: true,
        source: read.source,
        context: { workspace, packagePreflight: mocks.preflightClawPackage },
      });
      persistClawInstallRecord(legacyPlan, { status: "workspace_ready", nowMs: 1 });
      openMangabaClawStateDatabase()
        .db /* sqlite-allow-raw: test-only downgrade simulates a pre-v2 interrupted add. */
        .prepare("UPDATE claw_installs SET schema_version = ? WHERE agent_id = ?")
        .run("mangabaclaw.clawInstallRecord.v1", "demo-agent");
      await mkdir(workspace);
      let config = { agents: { list: [legacyPlan.agent.config] } };
      mocks.loadConfig.mockImplementation(() => config);
      mocks.applyClawAddPlan.mockImplementationOnce(async (boundedPlan) => {
        config = { agents: { list: [boundedPlan.agent.config] } };
        return {
          schemaVersion: "mangabaclaw.clawAddResult.v1",
          stability: "experimental",
          status: "partial",
          agent: boundedPlan.agent,
        };
      });

      await expect(
        runClawsAddCommand(manifestPath, {
          yes: true,
          planIntegrity: legacyPlan.planIntegrity,
          workspace,
          json: true,
        }),
      ).rejects.toThrow("__exit__:1");
      await runClawsAddCommand(manifestPath, {
        yes: true,
        planIntegrity: legacyPlan.planIntegrity,
        workspace,
        json: true,
      });

      expect(mocks.applyClawAddPlan).toHaveBeenLastCalledWith(
        expect.objectContaining({
          planIntegrity: expect.not.stringMatching(legacyPlan.planIntegrity),
          agent: expect.objectContaining({
            config: expect.objectContaining({
              tools: expect.objectContaining({
                profile: "full",
                allow: expect.not.arrayContaining(["bundle-mcp"]),
              }),
            }),
          }),
        }),
        expect.objectContaining({
          consentPlanIntegrity: legacyPlan.planIntegrity,
          resumePlan: expect.objectContaining({ planIntegrity: legacyPlan.planIntegrity }),
          resumeRecord: expect.objectContaining({
            schemaVersion: "mangabaclaw.clawInstallRecord.v1",
          }),
        }),
      );
    },
  );
});
