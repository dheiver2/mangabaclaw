import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { removeRegistryEntry, updateRegistry } from "../agents/sandbox/registry.js";
import { resolveSandboxWorkspaceLayoutPaths } from "../agents/sandbox/shared.js";
import {
  readWorkspaceStateSnapshot,
  resolveWorkspaceStateIdentity,
} from "../agents/workspace-state-store.js";
import {
  listSessionEntryKeysReadOnly,
  upsertSessionEntryCore,
} from "../config/sessions/session-accessor.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { parseAgentSessionKey } from "../routing/session-key.js";
import {
  closeMangabaClawAgentDatabasesForTest,
  resolveMangabaClawAgentSqlitePath,
} from "../state/mangabaclaw-agent-db.js";
import { closeMangabaClawStateDatabaseForTest } from "../state/mangabaclaw-state-db.js";
import { captureEnv, setTestEnvValue } from "../test-utils/env.js";
import {
  detectLegacyWorkspaceState,
  migrateLegacyWorkspaceState,
} from "./state-migrations.workspace-setup.js";

describe("sandbox workspace Doctor migration", () => {
  let envSnapshot: ReturnType<typeof captureEnv> | undefined;
  const tempDirs = useAutoCleanupTempDirTracker((cleanup) => {
    afterEach(() => {
      closeMangabaClawAgentDatabasesForTest();
      closeMangabaClawStateDatabaseForTest();
      envSnapshot?.restore();
      envSnapshot = undefined;
      cleanup();
    });
  });

  function setup() {
    // macOS os.tmpdir() is a /var -> /private/var symlink; prod resolvers return
    // canonical paths, so expectations must build from the realpathed root.
    const homeDir = fs.realpathSync(tempDirs.make("mangabaclaw-sandbox-workspace-migration-home-"));
    const stateDir = path.join(homeDir, ".mangabaclaw");
    const workspaceDir = path.join(homeDir, "workspace");
    fs.mkdirSync(workspaceDir, { recursive: true });
    envSnapshot ??= captureEnv(["HOME", "MANGABACLAW_HOME", "MANGABACLAW_STATE_DIR"]);
    setTestEnvValue("HOME", homeDir);
    setTestEnvValue("MANGABACLAW_STATE_DIR", stateDir);
    return {
      env: { ...process.env, HOME: homeDir, MANGABACLAW_STATE_DIR: stateDir },
      homeDir,
      stateDir,
      workspaceDir,
    };
  }

  async function registerSandboxSession(sessionKey: string) {
    const agentId = parseAgentSessionKey(sessionKey)?.agentId ?? "main";
    const sessionHash = createHash("sha256").update(sessionKey).digest("hex").slice(0, 12);
    await upsertSessionEntryCore(
      { agentId, env: process.env, sessionKey },
      { sessionId: `workspace-migration-proof-${sessionHash}`, updatedAt: 1 },
    );
  }

  async function registerSandboxRuntimeScope(sessionKey: string) {
    const sessionHash = createHash("sha256").update(sessionKey).digest("hex").slice(0, 12);
    await updateRegistry({
      containerName: `workspace-migration-proof-${sessionHash}`,
      sessionKey,
      createdAtMs: 1,
      lastUsedAtMs: 1,
      image: "mangabaclaw-sandbox:test",
    });
  }

  it("does not create an agent database when no sandbox sessions are persisted", () => {
    const context = setup();

    expect(listSessionEntryKeysReadOnly({ agentId: "main", env: context.env })).toEqual([]);
    expect(
      fs.existsSync(resolveMangabaClawAgentSqlitePath({ agentId: "main", env: context.env })),
    ).toBe(false);
  });

  it("reads durable agent-owned session keys without trusting runtime scope rows", async () => {
    const context = setup();
    const sessionKey = "agent:main:telegram:direct:doctor-proof";
    await registerSandboxSession(sessionKey);
    await registerSandboxSession("global");
    await registerSandboxRuntimeScope("agent:main");
    await registerSandboxRuntimeScope("shared");

    expect(listSessionEntryKeysReadOnly({ agentId: "main", env: context.env }).toSorted()).toEqual(
      [sessionKey, "global"].toSorted(),
    );
  });

  it("detects and removes legacy setup state in reused sandbox workspace copies", async () => {
    const context = setup();
    const env = {
      ...context.env,
      MANGABACLAW_CONFIG_PATH: path.join(context.stateDir, "mangabaclaw.json"),
    };
    const sandboxRoot = path.join(context.homeDir, "sandboxes");
    const configuredSandboxRoot = "~/sandboxes";
    const cfg = {
      agents: {
        defaults: {
          workspace: context.workspaceDir,
          sandbox: {
            mode: "all",
            scope: "agent",
            workspaceAccess: "ro",
            workspaceRoot: configuredSandboxRoot,
          },
        },
        entries: { main: { default: true } },
      },
    } satisfies MangabaClawConfig;
    const sandboxLayout = resolveSandboxWorkspaceLayoutPaths({
      cfg: { scope: "agent", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
      rawSessionKey: "agent:main:main",
      workspaceDir: context.workspaceDir,
    });
    const setupPath = path.join(sandboxLayout.sandboxWorkspaceDir, "mangabaclaw-workspace-state.json");
    await fsp.mkdir(sandboxLayout.sandboxWorkspaceDir, { recursive: true });
    await fsp.writeFile(
      setupPath,
      JSON.stringify({ version: 1, bootstrapSeededAt: "2026-07-20T00:00:00.000Z" }),
      "utf8",
    );

    const detected = detectLegacyWorkspaceState({
      cfg,
      stateDir: context.stateDir,
      env,
      homedir: () => context.homeDir,
      doctorOnlyStateMigrations: true,
    });

    expect(detected.hasLegacy).toBe(true);
    const detectedSource = detected.sources.find(
      (source) =>
        source.kind === "setup" &&
        path.normalize(source.sourcePath).toLowerCase() === path.normalize(setupPath).toLowerCase(),
    );
    expect(detectedSource).toMatchObject({
      kind: "setup",
      workspaceDir: resolveWorkspaceStateIdentity(sandboxLayout.sandboxWorkspaceDir).workspacePath,
    });

    const result = await migrateLegacyWorkspaceState({
      detected,
      env,
      stateDir: context.stateDir,
    });

    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(setupPath)).toBe(false);
    expect(readWorkspaceStateSnapshot(sandboxLayout.sandboxWorkspaceDir)).toMatchObject({
      setup: {
        bootstrapSeededAt: "2026-07-20T00:00:00.000Z",
      },
      setupExists: true,
    });
  });

  it.each(["shared", "session"] as const)(
    "repairs the runtime-derived %s sandbox workspace copy",
    async (scope) => {
      const context = setup();
      const sandboxRoot = path.join(context.homeDir, "sandboxes");
      const cfg = {
        agents: {
          defaults: {
            workspace: context.workspaceDir,
            sandbox: {
              mode: "all",
              scope,
              workspaceAccess: "ro",
              workspaceRoot: "~/sandboxes",
            },
          },
          entries: { main: { default: true } },
        },
      } satisfies MangabaClawConfig;
      const sandboxLayout = resolveSandboxWorkspaceLayoutPaths({
        cfg: { scope, workspaceAccess: "ro", workspaceRoot: sandboxRoot },
        rawSessionKey: "agent:main:telegram:direct:doctor-proof",
        workspaceDir: context.workspaceDir,
      });
      if (scope === "session") {
        await registerSandboxSession("agent:main:telegram:direct:doctor-proof");
      }
      const setupPath = path.join(
        sandboxLayout.sandboxWorkspaceDir,
        "mangabaclaw-workspace-state.json",
      );
      await fsp.mkdir(sandboxLayout.sandboxWorkspaceDir, { recursive: true });
      await fsp.writeFile(
        setupPath,
        JSON.stringify({ version: 1, bootstrapSeededAt: "2026-07-20T00:00:00.000Z" }),
        "utf8",
      );

      const detected = detectLegacyWorkspaceState({
        cfg,
        stateDir: context.stateDir,
        env: context.env,
        homedir: () => context.homeDir,
        doctorOnlyStateMigrations: true,
      });

      expect(detected.sources).toContainEqual(
        expect.objectContaining({
          kind: "setup",
          sourcePath: setupPath,
          workspaceDir: resolveWorkspaceStateIdentity(sandboxLayout.sandboxWorkspaceDir)
            .workspacePath,
        }),
      );

      const result = await migrateLegacyWorkspaceState({
        detected,
        env: context.env,
        stateDir: context.stateDir,
      });

      expect(result.warnings).toEqual([]);
      expect(fs.existsSync(setupPath)).toBe(false);
      expect(readWorkspaceStateSnapshot(sandboxLayout.sandboxWorkspaceDir)).toMatchObject({
        setup: { bootstrapSeededAt: "2026-07-20T00:00:00.000Z" },
        setupExists: true,
      });
    },
  );

  it.each([
    "agent:main:main",
    "agent:main:session-doctor-proof",
    "agent:main:telegram:direct:doctor-proof",
  ])("repairs durable session %s after its sandbox runtime has been pruned", async (sessionKey) => {
    const context = setup();
    const sandboxRoot = path.join(context.homeDir, "sandboxes");
    const cfg = {
      agents: {
        defaults: {
          workspace: context.workspaceDir,
          sandbox: {
            mode: "all",
            scope: "session",
            workspaceAccess: "ro",
            workspaceRoot: "~/sandboxes",
          },
        },
        entries: { main: { default: true } },
      },
    } satisfies MangabaClawConfig;
    const layout = resolveSandboxWorkspaceLayoutPaths({
      cfg: { scope: "session", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
      rawSessionKey: sessionKey,
      workspaceDir: context.workspaceDir,
    });
    const setupPath = path.join(layout.sandboxWorkspaceDir, "mangabaclaw-workspace-state.json");
    await fsp.mkdir(layout.sandboxWorkspaceDir, { recursive: true });
    await fsp.writeFile(
      setupPath,
      JSON.stringify({ version: 1, bootstrapSeededAt: "2026-07-20T00:00:00.000Z" }),
      "utf8",
    );
    await registerSandboxSession(sessionKey);
    await registerSandboxRuntimeScope(sessionKey);
    const sessionHash = createHash("sha256").update(sessionKey).digest("hex").slice(0, 12);
    await removeRegistryEntry(`workspace-migration-proof-${sessionHash}`);

    const detected = detectLegacyWorkspaceState({
      cfg,
      stateDir: context.stateDir,
      env: context.env,
      homedir: () => context.homeDir,
      doctorOnlyStateMigrations: true,
    });

    expect(detected.sources).toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: setupPath }),
    );

    const result = await migrateLegacyWorkspaceState({
      detected,
      env: context.env,
      stateDir: context.stateDir,
    });

    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(setupPath)).toBe(false);
    expect(readWorkspaceStateSnapshot(layout.sandboxWorkspaceDir)).toMatchObject({
      setup: { bootstrapSeededAt: "2026-07-20T00:00:00.000Z" },
      setupExists: true,
    });
  });

  it.each([
    { label: "disabled sandbox", mode: "off", workspaceAccess: "ro" },
    { label: "read-write agent workspace", mode: "all", workspaceAccess: "rw" },
  ] as const)(
    "does not import an inactive $label sandbox copy",
    async ({ mode, workspaceAccess }) => {
      const context = setup();
      const sandboxRoot = path.join(context.homeDir, "sandboxes");
      const cfg = {
        agents: {
          defaults: {
            workspace: context.workspaceDir,
            sandbox: {
              mode,
              scope: "agent",
              workspaceAccess,
              workspaceRoot: "~/sandboxes",
            },
          },
          entries: { main: { default: true } },
        },
      } satisfies MangabaClawConfig;
      const sandboxLayout = resolveSandboxWorkspaceLayoutPaths({
        cfg: { scope: "agent", workspaceAccess, workspaceRoot: sandboxRoot },
        rawSessionKey: "agent:main:main",
        workspaceDir: context.workspaceDir,
      });
      const setupPath = path.join(
        sandboxLayout.sandboxWorkspaceDir,
        "mangabaclaw-workspace-state.json",
      );
      await fsp.mkdir(sandboxLayout.sandboxWorkspaceDir, { recursive: true });
      await fsp.writeFile(setupPath, JSON.stringify({ version: 1 }), "utf8");

      const detected = detectLegacyWorkspaceState({
        cfg,
        stateDir: context.stateDir,
        env: context.env,
        homedir: () => context.homeDir,
        doctorOnlyStateMigrations: true,
      });

      expect(detected.hasLegacy).toBe(false);
      expect(fs.existsSync(setupPath)).toBe(true);
    },
  );

  it("never imports inactive, overlapping, or unrelated session sandbox copies", async () => {
    const context = setup();
    const sandboxRoot = path.join(context.homeDir, "sandboxes");
    const cfg = {
      agents: {
        defaults: {
          workspace: context.workspaceDir,
          sandbox: {
            mode: "all",
            scope: "session",
            workspaceAccess: "ro",
            workspaceRoot: "~/sandboxes",
          },
        },
        entries: {
          main: { default: true },
          "main-foo": { sandbox: { mode: "off" } },
          writer: { sandbox: { workspaceAccess: "rw" } },
        },
      },
    } satisfies MangabaClawConfig;
    const activeLayout = resolveSandboxWorkspaceLayoutPaths({
      cfg: { scope: "session", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
      rawSessionKey: "agent:main:telegram:direct:doctor-proof",
      workspaceDir: context.workspaceDir,
    });
    const inactiveLayout = resolveSandboxWorkspaceLayoutPaths({
      cfg: { scope: "session", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
      rawSessionKey: "agent:main-foo:telegram:direct:doctor-proof",
      workspaceDir: context.workspaceDir,
    });
    const readWriteLayout = resolveSandboxWorkspaceLayoutPaths({
      cfg: { scope: "session", workspaceAccess: "rw", workspaceRoot: sandboxRoot },
      rawSessionKey: "agent:writer:telegram:direct:doctor-proof",
      workspaceDir: context.workspaceDir,
    });
    const activePath = path.join(activeLayout.sandboxWorkspaceDir, "mangabaclaw-workspace-state.json");
    const protectedPaths = [
      path.join(inactiveLayout.sandboxWorkspaceDir, "mangabaclaw-workspace-state.json"),
      path.join(readWriteLayout.sandboxWorkspaceDir, "mangabaclaw-workspace-state.json"),
      path.join(
        resolveSandboxWorkspaceLayoutPaths({
          cfg: { scope: "session", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
          rawSessionKey: "agent:main",
          workspaceDir: context.workspaceDir,
        }).sandboxWorkspaceDir,
        "mangabaclaw-workspace-state.json",
      ),
      path.join(
        resolveSandboxWorkspaceLayoutPaths({
          cfg: { scope: "session", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
          rawSessionKey: "shared",
          workspaceDir: context.workspaceDir,
        }).sandboxWorkspaceDir,
        "mangabaclaw-workspace-state.json",
      ),
      path.join(sandboxRoot, "notes", "mangabaclaw-workspace-state.json"),
      path.join(sandboxRoot, "agent-unknown-12345678", "mangabaclaw-workspace-state.json"),
    ];
    for (const setupPath of [activePath, ...protectedPaths]) {
      await fsp.mkdir(path.dirname(setupPath), { recursive: true });
      await fsp.writeFile(
        setupPath,
        JSON.stringify({ version: 1, bootstrapSeededAt: "2026-07-20T00:00:00.000Z" }),
        "utf8",
      );
    }
    await registerSandboxSession("agent:main:telegram:direct:doctor-proof");
    await registerSandboxSession("agent:main-foo:telegram:direct:doctor-proof");
    await registerSandboxSession("agent:writer:telegram:direct:doctor-proof");
    await registerSandboxRuntimeScope("agent:main");
    await registerSandboxRuntimeScope("shared");

    const detected = detectLegacyWorkspaceState({
      cfg,
      stateDir: context.stateDir,
      env: context.env,
      homedir: () => context.homeDir,
      doctorOnlyStateMigrations: true,
    });

    expect(detected.sources).toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: activePath }),
    );
    for (const protectedPath of protectedPaths) {
      expect(detected.sources).not.toContainEqual(
        expect.objectContaining({ kind: "setup", sourcePath: protectedPath }),
      );
    }

    const result = await migrateLegacyWorkspaceState({
      detected,
      env: context.env,
      stateDir: context.stateDir,
    });

    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(activePath)).toBe(false);
    for (const protectedPath of protectedPaths) {
      expect(fs.existsSync(protectedPath)).toBe(true);
    }
  });

  it("uses registered session ownership for overlapping main and main-telegram agents", async () => {
    const context = setup();
    const sandboxRoot = path.join(context.homeDir, "sandboxes");
    const cfg = {
      agents: {
        defaults: {
          workspace: context.workspaceDir,
          sandbox: {
            mode: "all",
            scope: "session",
            workspaceAccess: "ro",
            workspaceRoot: "~/sandboxes",
          },
        },
        entries: {
          main: { default: true, sandbox: { mode: "off" } },
          "main-telegram": {},
        },
      },
    } satisfies MangabaClawConfig;
    const resolveSetupPath = (rawSessionKey: string) => {
      const layout = resolveSandboxWorkspaceLayoutPaths({
        cfg: { scope: "session", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
        rawSessionKey,
        workspaceDir: resolveAgentWorkspaceDir(
          cfg,
          parseAgentSessionKey(rawSessionKey)?.agentId ?? "main",
          context.env,
        ),
      });
      return path.join(layout.sandboxWorkspaceDir, "mangabaclaw-workspace-state.json");
    };
    const inactivePath = resolveSetupPath("agent:main:telegram:direct:doctor-proof");
    const activePath = resolveSetupPath("agent:main-telegram:signal:direct:doctor-proof");
    const protectedPaths = [inactivePath, activePath];
    for (const setupPath of protectedPaths) {
      await fsp.mkdir(path.dirname(setupPath), { recursive: true });
      await fsp.writeFile(setupPath, JSON.stringify({ version: 1 }), "utf8");
    }
    await registerSandboxSession("agent:main:telegram:direct:doctor-proof");
    await registerSandboxSession("agent:main-telegram:signal:direct:doctor-proof");

    const detected = detectLegacyWorkspaceState({
      cfg,
      stateDir: context.stateDir,
      env: context.env,
      homedir: () => context.homeDir,
      doctorOnlyStateMigrations: true,
    });

    expect(detected.sources).not.toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: inactivePath }),
    );
    expect(detected.sources).toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: activePath }),
    );

    const result = await migrateLegacyWorkspaceState({
      detected,
      env: context.env,
      stateDir: context.stateDir,
    });

    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(inactivePath)).toBe(true);
    expect(fs.existsSync(activePath)).toBe(false);
  });

  it("derives the default sandbox root from the requested state profile", async () => {
    const context = setup();
    const requestedStateDir = path.join(context.homeDir, "requested-profile");
    const requestedEnv = { ...context.env, MANGABACLAW_STATE_DIR: requestedStateDir };
    const sessionKey = "agent:main:telegram:direct:requested-default-root";
    const cfg = {
      agents: {
        defaults: {
          workspace: context.workspaceDir,
          sandbox: { mode: "all", scope: "session", workspaceAccess: "ro" },
        },
        entries: { main: { default: true } },
      },
    } satisfies MangabaClawConfig;
    const workspaceFor = (stateDir: string) =>
      resolveSandboxWorkspaceLayoutPaths({
        cfg: {
          scope: "session",
          workspaceAccess: "ro",
          workspaceRoot: path.join(stateDir, "sandboxes"),
        },
        rawSessionKey: sessionKey,
        workspaceDir: context.workspaceDir,
      }).sandboxWorkspaceDir;
    const requestedPath = path.join(
      workspaceFor(requestedStateDir),
      "mangabaclaw-workspace-state.json",
    );
    const ambientPath = path.join(workspaceFor(context.stateDir), "mangabaclaw-workspace-state.json");
    for (const setupPath of [requestedPath, ambientPath]) {
      await fsp.mkdir(path.dirname(setupPath), { recursive: true });
      await fsp.writeFile(
        setupPath,
        JSON.stringify({ version: 1, bootstrapSeededAt: "2026-07-20T00:00:00.000Z" }),
        "utf8",
      );
    }
    setTestEnvValue("MANGABACLAW_STATE_DIR", requestedStateDir);
    await registerSandboxSession(sessionKey);
    setTestEnvValue("MANGABACLAW_STATE_DIR", context.stateDir);

    const detected = detectLegacyWorkspaceState({
      cfg,
      stateDir: requestedStateDir,
      env: requestedEnv,
      homedir: () => context.homeDir,
      doctorOnlyStateMigrations: true,
    });

    expect(detected.sources).toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: requestedPath }),
    );
    expect(detected.sources).not.toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: ambientPath }),
    );

    const result = await migrateLegacyWorkspaceState({
      detected,
      env: requestedEnv,
      stateDir: requestedStateDir,
    });

    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(requestedPath)).toBe(false);
    expect(fs.existsSync(ambientPath)).toBe(true);
  });

  it("reads persisted session ownership from the requested state profile", async () => {
    const context = setup();
    const requestedStateDir = path.join(context.homeDir, "requested-profile");
    const requestedEnv = { ...context.env, MANGABACLAW_STATE_DIR: requestedStateDir };
    const sandboxRoot = path.join(context.homeDir, "sandboxes");
    const cfg = {
      agents: {
        defaults: {
          workspace: context.workspaceDir,
          sandbox: {
            mode: "all",
            scope: "session",
            workspaceAccess: "ro",
            workspaceRoot: "~/sandboxes",
          },
        },
        entries: { main: { default: true } },
      },
    } satisfies MangabaClawConfig;
    const requestedSession = "agent:main:telegram:direct:requested-profile";
    const ambientSession = "agent:main:slack:direct:ambient-profile";
    const workspaceFor = (sessionKey: string) =>
      resolveSandboxWorkspaceLayoutPaths({
        cfg: { scope: "session", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
        rawSessionKey: sessionKey,
        workspaceDir: context.workspaceDir,
      }).sandboxWorkspaceDir;
    const requestedPath = path.join(
      workspaceFor(requestedSession),
      "mangabaclaw-workspace-state.json",
    );
    const ambientPath = path.join(workspaceFor(ambientSession), "mangabaclaw-workspace-state.json");
    for (const setupPath of [requestedPath, ambientPath]) {
      await fsp.mkdir(path.dirname(setupPath), { recursive: true });
      await fsp.writeFile(setupPath, JSON.stringify({ version: 1 }), "utf8");
    }

    setTestEnvValue("MANGABACLAW_STATE_DIR", requestedStateDir);
    await registerSandboxSession(requestedSession);
    setTestEnvValue("MANGABACLAW_STATE_DIR", context.stateDir);
    await registerSandboxSession(ambientSession);

    expect(listSessionEntryKeysReadOnly({ agentId: "main", env: requestedEnv })).toEqual([
      requestedSession,
    ]);
    expect(listSessionEntryKeysReadOnly({ agentId: "main", env: context.env })).toEqual([
      ambientSession,
    ]);

    const detected = detectLegacyWorkspaceState({
      cfg,
      stateDir: requestedStateDir,
      env: requestedEnv,
      homedir: () => context.homeDir,
      doctorOnlyStateMigrations: true,
    });

    expect(detected.sources).toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: requestedPath }),
    );
    expect(detected.sources).not.toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: ambientPath }),
    );

    const result = await migrateLegacyWorkspaceState({
      detected,
      env: requestedEnv,
      stateDir: requestedStateDir,
    });

    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(requestedPath)).toBe(false);
    expect(fs.existsSync(ambientPath)).toBe(true);
  });

  it("does not claim an unregistered session copy from a removed agent", async () => {
    const context = setup();
    const sandboxRoot = path.join(context.homeDir, "sandboxes");
    const cfg = {
      agents: {
        defaults: {
          workspace: context.workspaceDir,
          sandbox: {
            mode: "all",
            scope: "session",
            workspaceAccess: "ro",
            workspaceRoot: "~/sandboxes",
          },
        },
        entries: { main: { default: true } },
      },
    } satisfies MangabaClawConfig;
    const activeLayout = resolveSandboxWorkspaceLayoutPaths({
      cfg: { scope: "session", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
      rawSessionKey: "agent:main:telegram:direct:doctor-proof",
      workspaceDir: context.workspaceDir,
    });
    const removedAgentLayout = resolveSandboxWorkspaceLayoutPaths({
      cfg: { scope: "session", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
      rawSessionKey: "agent:main-foo:telegram:direct:doctor-proof",
      workspaceDir: context.workspaceDir,
    });
    const activePath = path.join(activeLayout.sandboxWorkspaceDir, "mangabaclaw-workspace-state.json");
    const removedAgentPath = path.join(
      removedAgentLayout.sandboxWorkspaceDir,
      "mangabaclaw-workspace-state.json",
    );
    for (const setupPath of [activePath, removedAgentPath]) {
      await fsp.mkdir(path.dirname(setupPath), { recursive: true });
      await fsp.writeFile(setupPath, JSON.stringify({ version: 1 }), "utf8");
    }
    await registerSandboxSession("agent:main:telegram:direct:doctor-proof");

    const detected = detectLegacyWorkspaceState({
      cfg,
      stateDir: context.stateDir,
      env: context.env,
      homedir: () => context.homeDir,
      doctorOnlyStateMigrations: true,
    });

    expect(detected.sources).toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: activePath }),
    );
    expect(detected.sources).not.toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: removedAgentPath }),
    );

    const result = await migrateLegacyWorkspaceState({
      detected,
      env: context.env,
      stateDir: context.stateDir,
    });

    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(activePath)).toBe(false);
    expect(fs.existsSync(removedAgentPath)).toBe(true);
  });

  it("repairs the registered global main-session sandbox copy", async () => {
    const context = setup();
    const sandboxRoot = path.join(context.homeDir, "sandboxes");
    const cfg = {
      session: { scope: "global" },
      agents: {
        defaults: {
          workspace: context.workspaceDir,
          sandbox: {
            mode: "all",
            scope: "session",
            workspaceAccess: "ro",
            workspaceRoot: "~/sandboxes",
          },
        },
        entries: { main: { default: true } },
      },
    } satisfies MangabaClawConfig;
    const sandboxLayout = resolveSandboxWorkspaceLayoutPaths({
      cfg: { scope: "session", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
      rawSessionKey: "global",
      workspaceDir: context.workspaceDir,
    });
    const setupPath = path.join(sandboxLayout.sandboxWorkspaceDir, "mangabaclaw-workspace-state.json");
    await fsp.mkdir(sandboxLayout.sandboxWorkspaceDir, { recursive: true });
    await fsp.writeFile(
      setupPath,
      JSON.stringify({ version: 1, bootstrapSeededAt: "2026-07-20T00:00:00.000Z" }),
      "utf8",
    );
    await registerSandboxSession("global");

    const detected = detectLegacyWorkspaceState({
      cfg,
      stateDir: context.stateDir,
      env: context.env,
      homedir: () => context.homeDir,
      doctorOnlyStateMigrations: true,
    });

    expect(detected.sources).toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: setupPath }),
    );

    const result = await migrateLegacyWorkspaceState({
      detected,
      env: context.env,
      stateDir: context.stateDir,
    });

    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(setupPath)).toBe(false);
    expect(readWorkspaceStateSnapshot(sandboxLayout.sandboxWorkspaceDir)).toMatchObject({
      setup: { bootstrapSeededAt: "2026-07-20T00:00:00.000Z" },
      setupExists: true,
    });
  });

  it("does not migrate a main-session copy when sandbox mode is non-main", async () => {
    const context = setup();
    const sandboxRoot = path.join(context.homeDir, "sandboxes");
    const cfg = {
      agents: {
        defaults: {
          workspace: context.workspaceDir,
          sandbox: {
            mode: "non-main",
            scope: "session",
            workspaceAccess: "ro",
            workspaceRoot: "~/sandboxes",
          },
        },
        entries: { main: { default: true } },
      },
    } satisfies MangabaClawConfig;
    const mainLayout = resolveSandboxWorkspaceLayoutPaths({
      cfg: { scope: "session", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
      rawSessionKey: "agent:main:main",
      workspaceDir: context.workspaceDir,
    });
    const activeLayout = resolveSandboxWorkspaceLayoutPaths({
      cfg: { scope: "session", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
      rawSessionKey: "agent:main:telegram:direct:doctor-proof",
      workspaceDir: context.workspaceDir,
    });
    const mainPath = path.join(mainLayout.sandboxWorkspaceDir, "mangabaclaw-workspace-state.json");
    const activePath = path.join(activeLayout.sandboxWorkspaceDir, "mangabaclaw-workspace-state.json");
    for (const setupPath of [mainPath, activePath]) {
      await fsp.mkdir(path.dirname(setupPath), { recursive: true });
      await fsp.writeFile(
        setupPath,
        JSON.stringify({ version: 1, bootstrapSeededAt: "2026-07-20T00:00:00.000Z" }),
        "utf8",
      );
    }
    await registerSandboxSession("agent:main:main");
    await registerSandboxSession("agent:main:telegram:direct:doctor-proof");

    const detected = detectLegacyWorkspaceState({
      cfg,
      stateDir: context.stateDir,
      env: context.env,
      homedir: () => context.homeDir,
      doctorOnlyStateMigrations: true,
    });

    expect(detected.sources).toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: activePath }),
    );
    expect(detected.sources).not.toContainEqual(
      expect.objectContaining({ kind: "setup", sourcePath: mainPath }),
    );

    const result = await migrateLegacyWorkspaceState({
      detected,
      env: context.env,
      stateDir: context.stateDir,
    });

    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(activePath)).toBe(false);
    expect(fs.existsSync(mainPath)).toBe(true);
  });

  it("repairs sandbox workspace copies beneath the configured MangabaClaw home", async () => {
    const context = setup();
    const effectiveHome = path.join(context.homeDir, "effective-mangabaclaw-home");
    setTestEnvValue("MANGABACLAW_HOME", effectiveHome);
    const env = {
      ...context.env,
      MANGABACLAW_HOME: effectiveHome,
      MANGABACLAW_CONFIG_PATH: path.join(context.stateDir, "mangabaclaw.json"),
    };
    const sandboxRoot = path.join(effectiveHome, "sandboxes");
    const cfg = {
      agents: {
        defaults: {
          workspace: context.workspaceDir,
          sandbox: {
            mode: "all",
            scope: "agent",
            workspaceAccess: "ro",
            workspaceRoot: "~/sandboxes",
          },
        },
        entries: { main: { default: true } },
      },
    } satisfies MangabaClawConfig;
    const sandboxLayout = resolveSandboxWorkspaceLayoutPaths({
      cfg: { scope: "agent", workspaceAccess: "ro", workspaceRoot: sandboxRoot },
      rawSessionKey: "agent:main:main",
      workspaceDir: context.workspaceDir,
    });
    const setupPath = path.join(sandboxLayout.sandboxWorkspaceDir, "mangabaclaw-workspace-state.json");
    await fsp.mkdir(sandboxLayout.sandboxWorkspaceDir, { recursive: true });
    await fsp.writeFile(
      setupPath,
      JSON.stringify({ version: 1, bootstrapSeededAt: "2026-07-20T00:00:00.000Z" }),
      "utf8",
    );

    const detected = detectLegacyWorkspaceState({
      cfg,
      stateDir: context.stateDir,
      env,
      homedir: () => context.homeDir,
      doctorOnlyStateMigrations: true,
    });

    expect(detected.hasLegacy).toBe(true);
    expect(detected.sources).toContainEqual(
      expect.objectContaining({
        kind: "setup",
        sourcePath: setupPath,
        workspaceDir: resolveWorkspaceStateIdentity(sandboxLayout.sandboxWorkspaceDir)
          .workspacePath,
      }),
    );

    const result = await migrateLegacyWorkspaceState({
      detected,
      env,
      stateDir: context.stateDir,
    });

    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(setupPath)).toBe(false);
    expect(readWorkspaceStateSnapshot(sandboxLayout.sandboxWorkspaceDir)).toMatchObject({
      setup: {
        bootstrapSeededAt: "2026-07-20T00:00:00.000Z",
      },
      setupExists: true,
    });
  });
});
