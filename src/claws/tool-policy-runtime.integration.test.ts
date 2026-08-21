import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { resolveConversationCapabilityProfile } from "../agents/conversation-capability-profile.js";
import {
  buildConversationToolPolicyPipelineSteps,
  resolveConversationToolPolicies,
} from "../agents/conversation-tool-policy-pipeline.js";
import { applyToolPolicyPipeline } from "../agents/tool-policy-pipeline.js";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
} from "../config/runtime-snapshot.js";
import {
  closeMangabaClawStateDatabase,
  closeMangabaClawStateDatabaseForTest,
  openMangabaClawStateDatabase,
} from "../state/mangabaclaw-state-db.js";
import { resolveMangabaClawStateSqlitePath } from "../state/mangabaclaw-state-db.paths.js";
import { persistClawInstallRecord } from "./provenance.js";
import { makeProvenancePlan, stateEnv } from "./provenance.test-helpers.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

afterEach(() => {
  closeMangabaClawStateDatabaseForTest();
  clearRuntimeConfigSnapshot();
  vi.unstubAllEnvs();
});

describe("Claw tool policy consent provenance", () => {
  it("does not create writable state for an ordinary named profile", () => {
    const root = tempDirs.make("mangabaclaw-non-claw-tool-consent-");
    vi.stubEnv("MANGABACLAW_STATE_DIR", join(root, "state"));
    const config = { agents: { list: [{ id: "worker", tools: { profile: "coding" as const } }] } };
    setRuntimeConfigSnapshot(config);

    expect(() =>
      resolveConversationCapabilityProfile({
        agentId: "worker",
        config,
      }),
    ).not.toThrow();
    expect(existsSync(join(root, "state"))).toBe(false);
  });

  it("does not infer Claw ownership before consent provenance is initialized", () => {
    const root = tempDirs.make("mangabaclaw-uninitialized-claw-tool-consent-");
    const stateDir = join(root, "state");
    vi.stubEnv("MANGABACLAW_STATE_DIR", stateDir);
    const config = {
      agents: {
        list: [{ id: "worker", tools: { profile: "full" as const, allow: ["read"] } }],
      },
    };
    setRuntimeConfigSnapshot(config);

    expect(() =>
      resolveConversationCapabilityProfile({
        agentId: "worker",
        config,
      }),
    ).not.toThrow();
    expect(existsSync(stateDir)).toBe(false);
  });

  it("fails an ordinary named profile closed when initial ownership is unreadable", () => {
    const root = tempDirs.make("mangabaclaw-unreadable-non-claw-tool-consent-");
    const stateDir = join(root, "state");
    const env = { MANGABACLAW_STATE_DIR: stateDir };
    const databasePath = resolveMangabaClawStateSqlitePath(env);
    mkdirSync(dirname(databasePath), { recursive: true });
    writeFileSync(databasePath, "not a sqlite database");
    const before = readFileSync(databasePath);
    vi.stubEnv("MANGABACLAW_STATE_DIR", env.MANGABACLAW_STATE_DIR);

    const config = {
      agents: {
        list: [{ id: "worker", tools: { profile: "coding" as const } }],
      },
    };
    setRuntimeConfigSnapshot(config);

    expect(() =>
      resolveConversationCapabilityProfile({
        agentId: "worker",
        config,
      }),
    ).toThrow("Cannot verify the installed tool authority");
    expect(readFileSync(databasePath)).toEqual(before);
  });

  it("fails a known Claw closed without mutating unreadable consent provenance", async () => {
    const root = tempDirs.make("mangabaclaw-unreadable-claw-tool-consent-");
    const stateDir = join(root, "state");
    const env = { MANGABACLAW_STATE_DIR: stateDir };
    const databasePath = resolveMangabaClawStateSqlitePath(env);
    vi.stubEnv("MANGABACLAW_STATE_DIR", env.MANGABACLAW_STATE_DIR);
    const { plan } = await makeProvenancePlan(
      root,
      { schemaVersion: 1, agent: { id: "worker" } },
      {
        mangabaClawProfile: {
          schemaVersion: 1,
          agent: { tools: { profile: "full", allow: ["read"] } },
        },
      },
    );
    persistClawInstallRecord(plan, { env });
    closeMangabaClawStateDatabase();
    writeFileSync(databasePath, "not a sqlite database");
    const before = readFileSync(databasePath);

    const config = { agents: { list: [plan.agent.config] } };
    expect(() => openMangabaClawStateDatabase({ env })).toThrow();
    setRuntimeConfigSnapshot(config);

    expect(() =>
      resolveConversationCapabilityProfile({
        agentId: "worker",
        config,
      }),
    ).toThrow("Cannot verify the installed tool authority");
    expect(readFileSync(databasePath)).toEqual(before);
  });

  it("fails closed after the prepared state database closes", async () => {
    const root = tempDirs.make("mangabaclaw-closed-claw-tool-consent-");
    const env = stateEnv(root);
    vi.stubEnv("MANGABACLAW_STATE_DIR", env.MANGABACLAW_STATE_DIR);
    const { plan } = await makeProvenancePlan(
      root,
      { schemaVersion: 1, agent: { id: "worker" } },
      {
        mangabaClawProfile: {
          schemaVersion: 1,
          agent: { tools: { profile: "full", allow: ["read"] } },
        },
      },
    );
    persistClawInstallRecord(plan, { env });
    const config = { agents: { list: [plan.agent.config] } };
    setRuntimeConfigSnapshot(config);
    closeMangabaClawStateDatabase();

    expect(() =>
      resolveConversationCapabilityProfile({
        agentId: "worker",
        config,
      }),
    ).toThrow("Cannot verify the installed tool authority");
  });

  it("fails closed when the active agent config does not match consent provenance", async () => {
    const root = tempDirs.make("mangabaclaw-modified-claw-tool-consent-");
    const env = stateEnv(root);
    vi.stubEnv("MANGABACLAW_STATE_DIR", env.MANGABACLAW_STATE_DIR);
    const { plan } = await makeProvenancePlan(
      root,
      { schemaVersion: 1, agent: { id: "worker" } },
      {
        mangabaClawProfile: {
          schemaVersion: 1,
          agent: { tools: { profile: "full", allow: ["read"] } },
        },
      },
    );
    persistClawInstallRecord(plan, { env });
    const config = {
      agents: {
        list: [
          {
            ...plan.agent.config,
            tools: { profile: "full" as const, allow: ["read", "exec"] },
          },
        ],
      },
    };
    setRuntimeConfigSnapshot(config);

    expect(() =>
      resolveConversationCapabilityProfile({
        agentId: "worker",
        config,
      }),
    ).toThrow("Cannot verify the installed tool authority");
  });

  it("fails closed after a host upgrade leaves legacy profile provenance", async () => {
    const root = tempDirs.make("mangabaclaw-claw-tool-consent-");
    const env = stateEnv(root);
    vi.stubEnv("MANGABACLAW_STATE_DIR", join(root, "state"));
    const { plan } = await makeProvenancePlan(
      root,
      { schemaVersion: 1, agent: { id: "worker" } },
      {
        mangabaClawProfile: {
          schemaVersion: 1,
          agent: { tools: { profile: "coding", allow: ["read"] } },
        },
      },
    );
    persistClawInstallRecord(plan, { env });

    const config = { agents: { list: [plan.agent.config] } };
    setRuntimeConfigSnapshot(config);
    const capabilityProfile = resolveConversationCapabilityProfile({
      agentId: "worker",
      config,
    });
    const policies = resolveConversationToolPolicies({ capabilityProfile });
    const filtered = applyToolPolicyPipeline({
      tools: [{ name: "read" }, { name: "future_tool" }],
      toolMeta: (tool) => (tool.name === "future_tool" ? { pluginId: "read" } : undefined),
      warn: () => {},
      steps: buildConversationToolPolicyPipelineSteps({
        capabilityProfile,
        policies,
        includeRuntimeToolPolicy: true,
      }),
    });
    expect(filtered.map((tool) => tool.name)).toEqual(["read"]);

    openMangabaClawStateDatabase({ env })
      .db /* sqlite-allow-raw: test-only downgrade simulates an install created by the previous host. */
      .prepare("UPDATE claw_installs SET schema_version = ? WHERE agent_id = ?")
      .run("mangabaclaw.clawInstallRecord.v1", "worker");
    closeMangabaClawStateDatabase();
    openMangabaClawStateDatabase({ env });

    const legacyConfig = {
      agents: {
        list: [
          {
            ...plan.agent.config,
            tools: { profile: "coding" as const },
          },
        ],
      },
    };
    setRuntimeConfigSnapshot(legacyConfig);
    expect(() =>
      resolveConversationCapabilityProfile({
        agentId: "worker",
        config: legacyConfig,
      }),
    ).toThrow("uses a legacy dynamic tool policy");
  });

  it("gives a legacy unbounded full profile an actionable repair path", async () => {
    const root = tempDirs.make("mangabaclaw-claw-full-tool-consent-");
    const env = stateEnv(root);
    vi.stubEnv("MANGABACLAW_STATE_DIR", join(root, "state"));
    const { plan } = await makeProvenancePlan(
      root,
      { schemaVersion: 1, agent: { id: "worker" } },
      {
        mangabaClawProfile: {
          schemaVersion: 1,
          agent: { tools: { profile: "full", allow: ["read"] } },
        },
      },
    );
    persistClawInstallRecord(plan, { env });
    openMangabaClawStateDatabase({ env })
      .db /* sqlite-allow-raw: test-only downgrade simulates a legacy unbounded full profile. */
      .prepare("UPDATE claw_installs SET schema_version = ? WHERE agent_id = ?")
      .run("mangabaclaw.clawInstallRecord.v1", "worker");
    closeMangabaClawStateDatabase();
    openMangabaClawStateDatabase({ env });

    const config = {
      agents: {
        list: [
          {
            ...plan.agent.config,
            tools: { profile: "full" as const },
          },
        ],
      },
    };
    setRuntimeConfigSnapshot(config);

    expect(() =>
      resolveConversationCapabilityProfile({
        agentId: "worker",
        config,
      }),
    ).toThrow(
      "Add an explicit tools.allow list to its package MangabaClaw profile, then run `mangabaclaw claws update worker`",
    );
  });

  it("isolates an unsupported install record from other agents", async () => {
    const root = tempDirs.make("mangabaclaw-claw-tool-consent-isolation-");
    const env = stateEnv(root);
    const validRoot = join(root, "valid");
    const invalidRoot = join(root, "invalid");
    mkdirSync(validRoot);
    mkdirSync(invalidRoot);
    vi.stubEnv("MANGABACLAW_STATE_DIR", env.MANGABACLAW_STATE_DIR);
    const { plan: validPlan } = await makeProvenancePlan(
      validRoot,
      { schemaVersion: 1, agent: { id: "valid" } },
      {
        mangabaClawProfile: {
          schemaVersion: 1,
          agent: { tools: { profile: "full", allow: ["read"] } },
        },
      },
    );
    const { plan: invalidPlan } = await makeProvenancePlan(
      invalidRoot,
      { schemaVersion: 1, agent: { id: "invalid" } },
      {
        mangabaClawProfile: {
          schemaVersion: 1,
          agent: { tools: { profile: "full", allow: ["read"] } },
        },
      },
    );
    persistClawInstallRecord(validPlan, { env });
    persistClawInstallRecord(invalidPlan, { env });
    openMangabaClawStateDatabase({ env })
      .db /* sqlite-allow-raw: test-only corruption verifies per-agent failure isolation. */
      .prepare("UPDATE claw_installs SET schema_version = ? WHERE agent_id = ?")
      .run("mangabaclaw.clawInstallRecord.unsupported", "invalid");
    closeMangabaClawStateDatabase();
    openMangabaClawStateDatabase({ env });

    const config = { agents: { list: [validPlan.agent.config, invalidPlan.agent.config] } };
    setRuntimeConfigSnapshot(config);

    expect(() =>
      resolveConversationCapabilityProfile({
        agentId: "valid",
        config,
      }),
    ).not.toThrow();
    expect(() =>
      resolveConversationCapabilityProfile({
        agentId: "invalid",
        config,
      }),
    ).toThrow("Cannot verify the installed tool authority");
  });

  it("does not intersect a standalone Claw allowlist with the host profile", async () => {
    const root = tempDirs.make("mangabaclaw-claw-standalone-tool-consent-");
    const env = stateEnv(root);
    vi.stubEnv("MANGABACLAW_STATE_DIR", join(root, "state"));
    const { plan } = await makeProvenancePlan(
      root,
      { schemaVersion: 1, agent: { id: "worker" } },
      {
        mangabaClawProfile: {
          schemaVersion: 1,
          agent: { tools: { allow: ["read"] } },
        },
      },
    );
    persistClawInstallRecord(plan, { env });

    const config = {
      tools: { profile: "minimal" as const },
      agents: { list: [plan.agent.config] },
    };
    setRuntimeConfigSnapshot(config);
    const capabilityProfile = resolveConversationCapabilityProfile({
      agentId: "worker",
      config,
    });
    const policies = resolveConversationToolPolicies({
      capabilityProfile,
      additionalPolicyAllow: ["message", "tool_search"],
    });
    const filtered = applyToolPolicyPipeline({
      tools: [{ name: "read" }, { name: "exec" }, { name: "message" }, { name: "tool_search" }],
      toolMeta: () => undefined,
      warn: () => {},
      steps: buildConversationToolPolicyPipelineSteps({
        capabilityProfile,
        policies,
        includeRuntimeToolPolicy: true,
      }),
    });

    expect(plan.agent.config.tools).toEqual({ profile: "full", allow: ["read"] });
    expect(filtered.map((tool) => tool.name)).toEqual(["read"]);
  });
});
