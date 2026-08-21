// SSH sandbox backend tests cover runtime description/removal, remote seeding,
// command execution, bind validation, and backend config plumbing.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createRequireRecord,
  createSandboxBrowserConfig,
  createSandboxPruneConfig,
  createSandboxSshConfig,
} from "mangabaclaw/plugin-sdk/test-fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDirTracker } from "../../../test/helpers/temp-dir.js";
import type { MangabaClawConfig } from "../../config/config.js";
import { setActiveDegradedSecretOwners } from "../../secrets/runtime-degraded-state.js";
import { captureFullEnv } from "../../test-utils/env.js";
import type { SandboxConfig } from "./types.js";

const sshMocks = vi.hoisted(() => ({
  createSshSandboxSessionFromSettings: vi.fn(),
  disposeSshSandboxSession: vi.fn(),
  runSshSandboxCommand: vi.fn(),
  uploadDirectoryToSshTarget: vi.fn(),
  buildSshSandboxArgv: vi.fn(),
}));

vi.mock("./ssh.js", async () => {
  const actual = await vi.importActual<typeof import("./ssh.js")>("./ssh.js");
  return {
    ...actual,
    createSshSandboxSessionFromSettings: sshMocks.createSshSandboxSessionFromSettings,
    disposeSshSandboxSession: sshMocks.disposeSshSandboxSession,
    runSshSandboxCommand: sshMocks.runSshSandboxCommand,
    uploadDirectoryToSshTarget: sshMocks.uploadDirectoryToSshTarget,
    buildSshSandboxArgv: sshMocks.buildSshSandboxArgv,
  };
});

const {
  createPreprovisionedSshSandboxBackend,
  createSshSandboxBackend,
  resolveSshRuntimePaths,
  sshSandboxBackendManager,
} = await import("./ssh-backend.js");
const tempDirs = createTempDirTracker();

function createConfig(): MangabaClawConfig {
  return {
    agents: {
      defaults: {
        sandbox: {
          mode: "all",
          backend: "ssh",
          scope: "session",
          workspaceAccess: "rw",
          ssh: {
            target: "peter@example.com:2222",
            command: "ssh",
            workspaceRoot: "/remote/mangabaclaw",
            strictHostKeyChecking: true,
            updateHostKeys: true,
          },
        },
      },
    },
  };
}

function createSession() {
  return {
    command: "ssh",
    configPath: path.join(os.tmpdir(), "mangabaclaw-test-ssh-config"),
    host: "mangabaclaw-sandbox",
  };
}

const requireRecord = createRequireRecord("object", "expected-label");

function requireMockRecordArg(mock: ReturnType<typeof vi.fn>, callIndex: number, label: string) {
  return requireRecord(mock.mock.calls[callIndex]?.[0], label);
}

function requireSshRunCommandParams(callIndex = 0) {
  // Backend assertions inspect the normalized remote command params before the
  // ssh helper turns them into argv.
  return requireMockRecordArg(sshMocks.runSshSandboxCommand, callIndex, "ssh run command params");
}

function requireSshUploadParams(callIndex: number, label: string) {
  return requireMockRecordArg(sshMocks.uploadDirectoryToSshTarget, callIndex, label);
}

function createBackendSandboxConfig(params?: { binds?: string[]; target?: string }): SandboxConfig {
  return {
    mode: "all",
    backend: "ssh",
    scope: "session",
    workspaceAccess: "rw" as const,
    workspaceRoot: "~/.mangabaclaw/sandboxes",
    dockerTmpfsSource: "configured",
    docker: {
      image: "img",
      containerPrefix: "prefix-",
      workdir: "/workspace",
      readOnlyRoot: true,
      tmpfs: ["/tmp"],
      network: "none",
      capDrop: ["ALL"],
      env: {},
      ...(params?.binds ? { binds: params.binds } : {}),
    },
    ssh: {
      ...createSandboxSshConfig(
        "/remote/mangabaclaw",
        params?.target ? { target: params.target } : {},
      ),
    },
    browser: createSandboxBrowserConfig({
      image: "img",
      containerPrefix: "prefix-",
      cdpPort: 1,
      vncPort: 2,
      noVncPort: 3,
      autoStartTimeoutMs: 1,
    }),
    tools: { allow: [], deny: [] },
    prune: createSandboxPruneConfig(),
  };
}

async function expectBackendCreationToReject(params: {
  binds?: string[];
  target?: string;
  error: string;
}) {
  await expect(
    createSshSandboxBackend({
      sessionKey: "s",
      scopeKey: "s",
      workspaceDir: "/tmp/workspace",
      agentWorkspaceDir: "/tmp/workspace",
      cfg: createBackendSandboxConfig({
        binds: params.binds,
        target: params.target,
      }),
    }),
  ).rejects.toThrow(params.error);
}

describe("ssh sandbox backend", () => {
  let envSnapshot: ReturnType<typeof captureFullEnv>;

  beforeEach(() => {
    envSnapshot = captureFullEnv();
    vi.clearAllMocks();
    setActiveDegradedSecretOwners([]);
    sshMocks.createSshSandboxSessionFromSettings.mockResolvedValue(createSession());
    sshMocks.disposeSshSandboxSession.mockResolvedValue(undefined);
    sshMocks.runSshSandboxCommand.mockResolvedValue({
      stdout: Buffer.from("1\n"),
      stderr: Buffer.alloc(0),
      code: 0,
    });
    sshMocks.uploadDirectoryToSshTarget.mockResolvedValue(undefined);
    sshMocks.buildSshSandboxArgv.mockImplementation(({ session, remoteCommand, tty }) => [
      session.command,
      "-F",
      session.configPath,
      tty ? "-tt" : "-T",
      session.host,
      remoteCommand,
    ]);
  });

  afterEach(async () => {
    setActiveDegradedSecretOwners([]);
    envSnapshot.restore();
    tempDirs.cleanup();
    vi.restoreAllMocks();
  });

  it("preserves shared runtime identity and hashes workspace-qualified scopes", () => {
    expect(resolveSshRuntimePaths("/remote/mangabaclaw", "shared").runtimeId).toBe(
      "mangabaclaw-ssh-shared-8198076c",
    );
    expect(
      resolveSshRuntimePaths("/remote/mangabaclaw", `agent:main:workspace:${"a".repeat(32)}`)
        .runtimeId,
    ).toMatch(/^mangabaclaw-ssh-workspace-[a-f0-9]{32}$/);
  });

  it("describes runtimes via the configured ssh target", async () => {
    const result = await sshSandboxBackendManager.describeRuntime({
      entry: {
        containerName: "mangabaclaw-ssh-worker-abcd1234",
        backendId: "ssh",
        runtimeLabel: "mangabaclaw-ssh-worker-abcd1234",
        sessionKey: "agent:worker",
        createdAtMs: 1,
        lastUsedAtMs: 1,
        image: "peter@example.com:2222",
        configLabelKind: "Target",
      },
      config: createConfig(),
    });

    expect(result).toEqual({
      running: true,
      actualConfigLabel: "peter@example.com:2222",
      configLabelMatch: true,
    });
    const sessionSettings = requireMockRecordArg(
      sshMocks.createSshSandboxSessionFromSettings,
      0,
      "ssh session settings",
    );
    expect(sessionSettings.target).toBe("peter@example.com:2222");
    expect(sessionSettings.workspaceRoot).toBe("/remote/mangabaclaw");
    const commandParams = requireSshRunCommandParams();
    expect(commandParams.remoteCommand).toContain("/remote/mangabaclaw/mangabaclaw-ssh-agent-worker");
  });

  it("uses the derived registry agent for both validation and SSH settings", async () => {
    const config = createConfig();
    config.agents!.defaults!.sandbox!.ssh!.identityData = {
      source: "env",
      provider: "default",
      id: "UNMATERIALIZED_DEFAULT_IDENTITY",
    };
    config.agents!.list = [
      {
        id: "worker",
        sandbox: {
          ssh: {
            identityData: "MATERIALIZED WORKER IDENTITY",
          },
        },
      },
    ];

    await sshSandboxBackendManager.describeRuntime({
      entry: {
        containerName: "mangabaclaw-ssh-worker-abcd1234",
        backendId: "ssh",
        runtimeLabel: "mangabaclaw-ssh-worker-abcd1234",
        sessionKey: "agent:worker",
        createdAtMs: 1,
        lastUsedAtMs: 1,
        image: "peter@example.com:2222",
        configLabelKind: "Target",
      },
      config,
    });

    expect(
      requireMockRecordArg(sshMocks.createSshSandboxSessionFromSettings, 0, "ssh session settings")
        .identityData,
    ).toBe("MATERIALIZED WORKER IDENTITY");
  });

  it("rejects a cold agent owner before opening an SSH management session", async () => {
    setActiveDegradedSecretOwners([
      {
        ownerKind: "capability",
        ownerId: "agent-sandbox:worker",
        state: "unavailable",
        paths: ["agents.defaults.sandbox.ssh.identityData"],
        refKeys: ["env:default:MISSING_SSH_IDENTITY"],
        reason: "secret reference was not found",
      },
    ]);

    await expect(
      sshSandboxBackendManager.describeRuntime({
        entry: {
          containerName: "mangabaclaw-ssh-worker-abcd1234",
          backendId: "ssh",
          runtimeLabel: "mangabaclaw-ssh-worker-abcd1234",
          sessionKey: "agent:worker",
          createdAtMs: 1,
          lastUsedAtMs: 1,
          image: "peter@example.com:2222",
          configLabelKind: "Target",
        },
        config: createConfig(),
        agentId: "worker",
      }),
    ).rejects.toMatchObject({
      code: "SECRET_SURFACE_UNAVAILABLE",
      ownerKind: "capability",
      ownerId: "agent-sandbox:worker",
    });
    expect(sshMocks.createSshSandboxSessionFromSettings).not.toHaveBeenCalled();
  });

  it("rejects unmaterialized shared SSH refs even when no active owner inherited them", async () => {
    const config = createConfig();
    config.agents!.defaults!.sandbox!.mode = "off";
    config.agents!.defaults!.sandbox!.scope = "shared";
    config.agents!.defaults!.sandbox!.ssh!.identityData = {
      source: "env",
      provider: "default",
      id: "MISSING_SHARED_SSH_IDENTITY",
    };

    await expect(
      sshSandboxBackendManager.removeRuntime({
        entry: {
          containerName: "mangabaclaw-ssh-shared-abcd1234",
          backendId: "ssh",
          runtimeLabel: "mangabaclaw-ssh-shared-abcd1234",
          sessionKey: "shared",
          createdAtMs: 1,
          lastUsedAtMs: 1,
          image: "peter@example.com:2222",
          configLabelKind: "Target",
        },
        config,
      }),
    ).rejects.toMatchObject({
      code: "SECRET_SURFACE_UNAVAILABLE",
      ownerKind: "capability",
      ownerId: "agent-sandbox:shared",
    });
    expect(sshMocks.createSshSandboxSessionFromSettings).not.toHaveBeenCalled();
  });

  it("does not block shared SSH management for an unrelated cold agent override", async () => {
    setActiveDegradedSecretOwners([
      {
        ownerKind: "capability",
        ownerId: "agent-sandbox:cold",
        state: "unavailable",
        paths: ["agents.list.0.sandbox.ssh.identityData"],
        refKeys: ["env:default:MISSING_AGENT_SSH_IDENTITY"],
        reason: "secret reference was not found",
      },
    ]);
    const config = createConfig();
    config.agents!.defaults!.sandbox!.scope = "shared";

    await sshSandboxBackendManager.removeRuntime({
      entry: {
        containerName: "mangabaclaw-ssh-shared-abcd1234",
        backendId: "ssh",
        runtimeLabel: "mangabaclaw-ssh-shared-abcd1234",
        sessionKey: "shared",
        createdAtMs: 1,
        lastUsedAtMs: 1,
        image: "peter@example.com:2222",
        configLabelKind: "Target",
      },
      config,
    });

    expect(sshMocks.createSshSandboxSessionFromSettings).toHaveBeenCalledTimes(1);
  });

  it("removes runtimes by deleting the remote scope root", async () => {
    await sshSandboxBackendManager.removeRuntime({
      entry: {
        containerName: "mangabaclaw-ssh-worker-abcd1234",
        backendId: "ssh",
        runtimeLabel: "mangabaclaw-ssh-worker-abcd1234",
        sessionKey: "agent:worker",
        createdAtMs: 1,
        lastUsedAtMs: 1,
        image: "peter@example.com:2222",
        configLabelKind: "Target",
      },
      config: createConfig(),
    });

    const commandParams = requireSshRunCommandParams();
    expect(commandParams.allowFailure).toBe(true);
    expect(commandParams.remoteCommand).toContain('rm -rf -- "$1"');
  });

  it("creates a remote-canonical backend that seeds once and reuses ssh exec", async () => {
    sshMocks.runSshSandboxCommand
      .mockResolvedValueOnce({
        stdout: Buffer.from("0\n"),
        stderr: Buffer.alloc(0),
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        code: 0,
      });
    const skillsWorkspaceDir = tempDirs.make("mangabaclaw-ssh-skills-");
    await fs.mkdir(path.join(skillsWorkspaceDir, "skills"), { recursive: true });

    const backend = await createSshSandboxBackend({
      sessionKey: "agent:worker:task",
      scopeKey: "agent:worker",
      workspaceDir: "/tmp/workspace",
      agentWorkspaceDir: "/tmp/agent",
      skillsWorkspaceDir,
      cfg: {
        mode: "all",
        backend: "ssh",
        scope: "session",
        workspaceAccess: "rw",
        workspaceRoot: "~/.mangabaclaw/sandboxes",
        dockerTmpfsSource: "configured",
        docker: {
          image: "mangabaclaw-sandbox:bookworm-slim",
          containerPrefix: "mangabaclaw-sbx-",
          workdir: "/workspace",
          readOnlyRoot: true,
          tmpfs: ["/tmp"],
          network: "none",
          capDrop: ["ALL"],
          env: { LANG: "C.UTF-8" },
        },
        ssh: {
          target: "peter@example.com:2222",
          command: "ssh",
          workspaceRoot: "/remote/mangabaclaw",
          strictHostKeyChecking: true,
          updateHostKeys: true,
        },
        browser: {
          enabled: false,
          image: "mangabaclaw-browser",
          containerPrefix: "mangabaclaw-browser-",
          network: "bridge",
          cdpPort: 9222,
          vncPort: 5900,
          noVncPort: 6080,
          headless: true,
          noVncEnabled: false,
          allowHostControl: false,
          autoStart: false,
          autoStartTimeoutMs: 1000,
        },
        tools: { allow: [], deny: [] },
        prune: { idleHours: 24, maxAgeDays: 7 },
      },
    });

    const execSpec = await backend.buildExecSpec({
      command: "pwd",
      env: { TEST_TOKEN: "1" },
      usePty: false,
    });

    expect(execSpec.argv.slice(0, 5)).toEqual([
      "ssh",
      "-F",
      createSession().configPath,
      "-T",
      createSession().host,
    ]);
    expect(execSpec.argv.at(-1)).toContain("/remote/mangabaclaw/mangabaclaw-ssh-agent-worker");
    expect(sshMocks.uploadDirectoryToSshTarget).toHaveBeenCalledTimes(3);
    const workspaceUploadParams = requireSshUploadParams(0, "workspace upload params");
    expect(workspaceUploadParams.localDir).toBe("/tmp/workspace");
    expect(workspaceUploadParams.remoteDir).toContain("/workspace");
    const agentUploadParams = requireRecord(
      sshMocks.uploadDirectoryToSshTarget.mock.calls.at(1)?.[0],
      "agent upload params",
    );
    expect(agentUploadParams.localDir).toBe("/tmp/agent");
    expect(agentUploadParams.remoteDir).toContain("/agent");
    const skillsUploadParams = requireRecord(
      sshMocks.uploadDirectoryToSshTarget.mock.calls.at(2)?.[0],
      "skills upload params",
    );
    expect(skillsUploadParams.localDir).toBe(skillsWorkspaceDir);
    expect(skillsUploadParams.remoteDir).toContain("/workspace/.mangabaclaw/sandbox-skills");

    await backend.finalizeExec?.({
      status: "completed",
      exitCode: 0,
      timedOut: false,
      token: execSpec.finalizeToken,
    });
    expect(sshMocks.createSshSandboxSessionFromSettings).toHaveBeenCalledTimes(2);
    expect(sshMocks.disposeSshSandboxSession).toHaveBeenCalledTimes(2);
  });

  it("adopts a preprovisioned workdir without clearing or uploading placement files", async () => {
    const remoteWorkspaceDir = "/srv/mangabaclaw/workspaces/session-1";
    const backend = await createPreprovisionedSshSandboxBackend(
      {
        sessionKey: "agent:worker:task",
        scopeKey: "agent:worker",
        workspaceDir: "/tmp/workspace",
        agentWorkspaceDir: "/tmp/agent",
        skillsWorkspaceDir: "/tmp/skills",
        cfg: createBackendSandboxConfig({ target: "peter@example.com:2222" }),
      },
      {
        runtimeId: "remote-exec:environment-1:7:11",
        remoteWorkspaceDir,
      },
    );

    expect(backend.runtimeId).toBe("remote-exec:environment-1:7:11");
    expect(backend.workdir).toBe(remoteWorkspaceDir);
    expect(backend.workdirRoots).toEqual([remoteWorkspaceDir]);

    const execSpec = await backend.buildExecSpec({
      command: "pwd",
      env: {},
      usePty: false,
    });

    expect(execSpec.argv.at(-1)).toContain(remoteWorkspaceDir);
    expect(sshMocks.uploadDirectoryToSshTarget).not.toHaveBeenCalled();
    expect(sshMocks.runSshSandboxCommand).not.toHaveBeenCalled();
    await backend.runShellCommand({ script: "pwd" });
    expect(sshMocks.uploadDirectoryToSshTarget).not.toHaveBeenCalled();
    expect(String(requireSshRunCommandParams().remoteCommand)).not.toContain(
      "mangabaclaw-sandbox-clear",
    );

    await backend.finalizeExec?.({
      status: "completed",
      exitCode: 0,
      timedOut: false,
      token: execSpec.finalizeToken,
    });
  });

  it("validates remote workdirs before exec accepts backend-owned cwd", async () => {
    sshMocks.runSshSandboxCommand
      .mockResolvedValueOnce({
        stdout: Buffer.from("1\n"),
        stderr: Buffer.alloc(0),
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: Buffer.from("/remote/mangabaclaw/mangabaclaw-ssh-agent-worker-abcd1234/workspace/src\n"),
        stderr: Buffer.alloc(0),
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: Buffer.alloc(0),
        stderr: Buffer.from("remote directory not found\n"),
        code: 1,
      })
      .mockResolvedValueOnce({
        stdout: Buffer.from("/remote/mangabaclaw/mangabaclaw-ssh-agent-worker-abcd1234/agent/src\n"),
        stderr: Buffer.alloc(0),
        code: 0,
      });

    const backend = await createSshSandboxBackend({
      sessionKey: "agent:worker:task",
      scopeKey: "agent:worker",
      workspaceDir: "/tmp/workspace",
      agentWorkspaceDir: "/tmp/workspace",
      cfg: createBackendSandboxConfig({
        target: "peter@example.com:2222",
      }),
    });

    await expect(
      backend.validateWorkdir?.(
        "/remote/mangabaclaw/mangabaclaw-ssh-agent-worker-abcd1234/workspace/src",
      ),
    ).resolves.toBe("/remote/mangabaclaw/mangabaclaw-ssh-agent-worker-abcd1234/workspace/src");
    await expect(
      backend.validateWorkdir?.(
        "/remote/mangabaclaw/mangabaclaw-ssh-agent-worker-abcd1234/workspace/missing",
      ),
    ).resolves.toBeNull();
    await expect(
      backend.validateWorkdir?.("/remote/mangabaclaw/mangabaclaw-ssh-agent-worker-abcd1234/agent/src"),
    ).resolves.toBe("/remote/mangabaclaw/mangabaclaw-ssh-agent-worker-abcd1234/agent/src");

    const validationCommand = String(requireSshRunCommandParams(1).remoteCommand);
    expect(validationCommand).toContain("mangabaclaw-validate-workdir");
    expect(validationCommand).toContain("remote directory must stay under root");
    const agentValidationCommand = String(requireSshRunCommandParams(3).remoteCommand);
    expect(agentValidationCommand).toContain(
      "/remote/mangabaclaw/mangabaclaw-ssh-agent-worker-abcd1234/agent",
    );
  });

  it("refreshes materialized skills before validating a skills workdir", async () => {
    const skillsWorkspaceDir = tempDirs.make("mangabaclaw-ssh-skills-");
    await fs.mkdir(path.join(skillsWorkspaceDir, "skills", "demo"), { recursive: true });
    const runtimePaths = resolveSshRuntimePaths("/remote/mangabaclaw", "agent:worker");
    const skillsWorkdir = path.posix.join(runtimePaths.remoteSkillsWorkspaceDir, "skills", "demo");
    sshMocks.runSshSandboxCommand
      .mockResolvedValueOnce({
        stdout: Buffer.from("1\n"),
        stderr: Buffer.alloc(0),
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: Buffer.from(`${skillsWorkdir}\n`),
        stderr: Buffer.alloc(0),
        code: 0,
      });

    const backend = await createSshSandboxBackend({
      sessionKey: "agent:worker:task",
      scopeKey: "agent:worker",
      workspaceDir: "/tmp/workspace",
      agentWorkspaceDir: "/tmp/workspace",
      skillsWorkspaceDir,
      cfg: createBackendSandboxConfig({
        target: "peter@example.com:2222",
      }),
    });

    await expect(backend.validateWorkdir?.(skillsWorkdir)).resolves.toBe(skillsWorkdir);
    const execSpec = await backend.buildExecSpec({
      command: "pwd",
      workdir: skillsWorkdir,
      env: {},
      usePty: false,
    });

    expect(sshMocks.uploadDirectoryToSshTarget).toHaveBeenCalledOnce();
    const skillsUploadParams = requireSshUploadParams(0, "skills upload params");
    expect(skillsUploadParams.localDir).toBe(skillsWorkspaceDir);
    expect(skillsUploadParams.remoteDir).toBe(runtimePaths.remoteSkillsWorkspaceDir);
    expect(execSpec.argv.at(-1)).toContain(skillsWorkdir);
    await backend.finalizeExec?.({
      status: "completed",
      exitCode: 0,
      timedOut: false,
      token: execSpec.finalizeToken,
    });
  });

  it("discards validated materialized skills refreshes that do not launch", async () => {
    const skillsWorkspaceDir = tempDirs.make("mangabaclaw-ssh-skills-");
    await fs.mkdir(path.join(skillsWorkspaceDir, "skills", "demo"), { recursive: true });
    const runtimePaths = resolveSshRuntimePaths("/remote/mangabaclaw", "agent:worker");
    const skillsWorkdir = path.posix.join(runtimePaths.remoteSkillsWorkspaceDir, "skills", "demo");
    sshMocks.runSshSandboxCommand
      .mockResolvedValueOnce({
        stdout: Buffer.from("1\n"),
        stderr: Buffer.alloc(0),
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: Buffer.from(`${skillsWorkdir}\n`),
        stderr: Buffer.alloc(0),
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        code: 0,
      });

    const backend = await createSshSandboxBackend({
      sessionKey: "agent:worker:task",
      scopeKey: "agent:worker",
      workspaceDir: "/tmp/workspace",
      agentWorkspaceDir: "/tmp/workspace",
      skillsWorkspaceDir,
      cfg: createBackendSandboxConfig({
        target: "peter@example.com:2222",
      }),
    });

    await expect(backend.validateWorkdir?.(skillsWorkdir)).resolves.toBe(skillsWorkdir);
    backend.discardPreparedWorkdir?.(skillsWorkdir);

    const execSpec = await backend.buildExecSpec({
      command: "pwd",
      workdir: skillsWorkdir,
      env: {},
      usePty: false,
    });

    expect(sshMocks.uploadDirectoryToSshTarget).toHaveBeenCalledTimes(2);
    await backend.finalizeExec?.({
      status: "completed",
      exitCode: 0,
      timedOut: false,
      token: execSpec.finalizeToken,
    });
  });

  it("refreshes materialized skills before each exec and remote fs command", async () => {
    const skillsWorkspaceDir = tempDirs.make("mangabaclaw-ssh-skills-");
    await fs.mkdir(path.join(skillsWorkspaceDir, "skills"), { recursive: true });
    const backend = await createSshSandboxBackend({
      sessionKey: "agent:worker:task",
      scopeKey: "agent:worker",
      workspaceDir: "/tmp/workspace",
      agentWorkspaceDir: "/tmp/workspace",
      skillsWorkspaceDir,
      cfg: createBackendSandboxConfig({
        target: "peter@example.com:2222",
      }),
    });

    const firstExec = await backend.buildExecSpec({
      command: "pwd",
      env: {},
      usePty: false,
    });
    const secondExec = await backend.buildExecSpec({
      command: "pwd",
      env: {},
      usePty: false,
    });
    await backend.runShellCommand({
      script: "printf ok",
    });

    expect(sshMocks.uploadDirectoryToSshTarget).toHaveBeenCalledTimes(3);
    const skillsUploadParams = requireSshUploadParams(0, "skills upload params");
    expect(skillsUploadParams.localDir).toBe(skillsWorkspaceDir);
    expect(skillsUploadParams.remoteDir).toContain("/workspace/.mangabaclaw/sandbox-skills");
    await backend.finalizeExec?.({
      status: "completed",
      exitCode: 0,
      timedOut: false,
      token: firstExec.finalizeToken,
    });
    await backend.finalizeExec?.({
      status: "completed",
      exitCode: 0,
      timedOut: false,
      token: secondExec.finalizeToken,
    });
  });

  it("clears stale remote materialized skills when the local copy is missing", async () => {
    const tmpDir = tempDirs.make("mangabaclaw-ssh-skills-");
    const skillsWorkspaceDir = path.join(tmpDir, "missing");
    const backend = await createSshSandboxBackend({
      sessionKey: "agent:worker:task",
      scopeKey: "agent:worker",
      workspaceDir: "/tmp/workspace",
      agentWorkspaceDir: "/tmp/workspace",
      skillsWorkspaceDir,
      cfg: createBackendSandboxConfig({
        target: "peter@example.com:2222",
      }),
    });

    const execSpec = await backend.buildExecSpec({
      command: "pwd",
      env: {},
      usePty: false,
    });

    expect(sshMocks.uploadDirectoryToSshTarget).not.toHaveBeenCalled();
    const commandParams = requireSshRunCommandParams(1);
    expect(commandParams.remoteCommand).toContain("mangabaclaw-sandbox-clear");
    expect(commandParams.remoteCommand).toContain("/workspace/.mangabaclaw/sandbox-skills");
    await backend.finalizeExec?.({
      status: "completed",
      exitCode: 0,
      timedOut: false,
      token: execSpec.finalizeToken,
    });
  });

  it("disposes the exec ssh session when materialized skills refresh fails", async () => {
    const skillsWorkspaceDir = tempDirs.make("mangabaclaw-ssh-skills-");
    await fs.mkdir(path.join(skillsWorkspaceDir, "skills"), { recursive: true });
    const backend = await createSshSandboxBackend({
      sessionKey: "agent:worker:task",
      scopeKey: "agent:worker",
      workspaceDir: "/tmp/workspace",
      agentWorkspaceDir: "/tmp/workspace",
      skillsWorkspaceDir,
      cfg: createBackendSandboxConfig({
        target: "peter@example.com:2222",
      }),
    });
    sshMocks.uploadDirectoryToSshTarget.mockRejectedValueOnce(new Error("upload failed"));

    await expect(
      backend.buildExecSpec({
        command: "pwd",
        env: {},
        usePty: false,
      }),
    ).rejects.toThrow("upload failed");

    expect(sshMocks.uploadDirectoryToSshTarget).toHaveBeenCalledTimes(1);
    expect(sshMocks.disposeSshSandboxSession).toHaveBeenCalledTimes(2);
  });

  it("filters blocked secrets from exec subprocess env", async () => {
    process.env.OPENAI_API_KEY = "sk-test-secret";
    process.env.LANG = "en_US.UTF-8";
    const backend = await createSshSandboxBackend({
      sessionKey: "agent:worker:task",
      scopeKey: "agent:worker",
      workspaceDir: "/tmp/workspace",
      agentWorkspaceDir: "/tmp/agent",
      cfg: createBackendSandboxConfig({
        target: "peter@example.com:2222",
      }),
    });

    const execSpec = await backend.buildExecSpec({
      command: "pwd",
      env: {},
      usePty: false,
    });

    expect(execSpec.env?.OPENAI_API_KEY).toBeUndefined();
    expect(execSpec.env?.LANG).toBe("en_US.UTF-8");
  });

  it("rejects docker binds and missing ssh target", async () => {
    await expectBackendCreationToReject({
      binds: ["/tmp:/tmp:rw"],
      target: "peter@example.com:22",
      error: "does not support sandbox.docker.binds",
    });

    await expectBackendCreationToReject({
      error: "requires agents.defaults.sandbox.ssh.target",
    });
  });
});
