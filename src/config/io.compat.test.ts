// Verifies config IO compatibility loading and migration behavior.
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveContextTokensForModelFromCache } from "../agents/context-resolution.js";
import { withTempDir } from "../test-utils/temp-dir.js";
import { VERSION } from "../version.js";
import { createConfigIO } from "./io.factory.js";
import { normalizeExecSafeBinProfilesInConfig } from "./normalize-exec-safe-bin.js";

vi.mock("../commands/doctor/shared/legacy-config-compat.js", () => ({
  applyLegacyDoctorMigrations: () => {
    throw new Error("config IO compatibility tests must not enter recovery migration");
  },
}));

vi.mock("../plugins/gateway-startup-plugin-ids.js", () => ({
  createConfigValidationMetadataPluginIdScope: (params: {
    config: { plugins?: { entries?: Record<string, unknown> } };
  }) => {
    const configuredPluginIds = Object.keys(params.config.plugins?.entries ?? {}).toSorted();
    const removedPluginIds = new Set(["google-antigravity-auth", "google-gemini-cli-auth"]);
    if (configuredPluginIds.some((pluginId) => !removedPluginIds.has(pluginId))) {
      throw new Error("config IO compatibility tests require real metadata for active plugins");
    }
    return {
      key: `io-compat:${configuredPluginIds.join(",")}`,
      resolve: () => [],
    };
  },
}));

vi.mock("../plugins/plugin-metadata-snapshot.js", () => ({
  rebasePluginMetadataSnapshotManifestRegistry: () => {
    throw new Error("config IO compatibility tests must not materialize metadata snapshots");
  },
  resolvePluginMetadataSnapshot: () => ({
    manifestRegistry: { plugins: [], diagnostics: [] },
  }),
}));

function withTempHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  return withTempDir("mangabaclaw-config-compat-", run);
}

async function writeConfig(
  home: string,
  dirname: ".mangabaclaw",
  port: number,
  filename = "mangabaclaw.json",
) {
  const dir = path.join(home, dirname);
  await fs.mkdir(dir, { recursive: true });
  const configPath = path.join(dir, filename);
  await fs.writeFile(configPath, JSON.stringify({ gateway: { port } }, null, 2));
  return configPath;
}

function createIoForHome(home: string, env: NodeJS.ProcessEnv = {} as NodeJS.ProcessEnv) {
  return createConfigIO({
    env: { HOME: home, ...env },
    homedir: () => home,
  });
}

describe("config io paths", () => {
  it("uses ~/.mangabaclaw/mangabaclaw.json when config exists", async () => {
    await withTempHome(async (home) => {
      const configPath = await writeConfig(home, ".mangabaclaw", 19001);
      const io = createIoForHome(home);
      expect(io.configPath).toBe(configPath);
    });
  });

  it("defaults to ~/.mangabaclaw/mangabaclaw.json when config is missing", async () => {
    await withTempHome(async (home) => {
      const io = createIoForHome(home);
      expect(io.configPath).toBe(path.join(home, ".mangabaclaw", "mangabaclaw.json"));
    });
  });

  it("uses MANGABACLAW_HOME for default config path", async () => {
    await withTempHome(async (home) => {
      const io = createConfigIO({
        env: { MANGABACLAW_HOME: path.join(home, "svc-home") } as NodeJS.ProcessEnv,
        homedir: () => path.join(home, "ignored-home"),
      });
      expect(io.configPath).toBe(path.join(home, "svc-home", ".mangabaclaw", "mangabaclaw.json"));
    });
  });

  it("honors explicit MANGABACLAW_CONFIG_PATH override", async () => {
    await withTempHome(async (home) => {
      const customPath = await writeConfig(home, ".mangabaclaw", 20002, "custom.json");
      const io = createIoForHome(home, { MANGABACLAW_CONFIG_PATH: customPath } as NodeJS.ProcessEnv);
      expect(io.configPath).toBe(customPath);
    });
  });

  it("keeps canonical custom gateway bind byte-identical during load", async () => {
    await withTempHome(async (home) => {
      const configPath = path.join(home, ".mangabaclaw", "mangabaclaw.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      const gateway = {
        mode: "local" as const,
        bind: "custom" as const,
        customBindHost: "127.0.0.1",
      };
      const raw = `${JSON.stringify({ gateway }, null, 2)}\n`;
      await fs.writeFile(configPath, raw, "utf-8");
      const io = createConfigIO({
        configPath,
        env: { HOME: home } as NodeJS.ProcessEnv,
        homedir: () => home,
      });

      const config = io.loadConfig();

      expect(config.gateway).toMatchObject({ bind: "custom", customBindHost: "127.0.0.1" });
      await expect(fs.readFile(configPath, "utf-8")).resolves.toBe(raw);
    });
  });

  it("loads retired context-budget shapes and surfaces migration guidance without rewriting", async () => {
    await withTempHome(async (home) => {
      const configPath = path.join(home, ".mangabaclaw", "mangabaclaw.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      const authored = {
        models: {
          providers: {
            openai: {
              contextTokens: 64_000,
              contextWindow: 128_000,
              models: [{ id: "gpt-5.4", name: "GPT-5.4" }],
            },
          },
        },
        agents: {
          defaults: { contextTokens: 48_000 },
          entries: { ops: { contextTokens: 32_000 } },
        },
      };
      const raw = `${JSON.stringify(authored, null, 2)}\n`;
      await fs.writeFile(configPath, raw, "utf-8");
      const logger = { error: vi.fn(), warn: vi.fn() };
      const io = createConfigIO({
        configPath,
        env: { HOME: home } as NodeJS.ProcessEnv,
        homedir: () => home,
        logger,
        pluginValidation: "core-only",
      });

      const config = io.loadConfig();
      const snapshot = await io.readConfigFileSnapshot();
      const provider = config.models?.providers?.openai;
      const resolvedBudget = resolveContextTokensForModelFromCache({
        cfg: config,
        provider: "openai",
        model: "gpt-5.4",
      });

      expect(snapshot.valid, JSON.stringify(snapshot.issues)).toBe(true);
      expect(provider).not.toHaveProperty("contextTokens");
      expect(provider).not.toHaveProperty("contextWindow");
      expect(provider?.models?.[0]).toMatchObject({
        contextTokens: 64_000,
        contextWindow: 128_000,
      });
      expect(config.agents?.defaults).not.toHaveProperty("contextTokens");
      expect(config.agents?.entries?.ops).not.toHaveProperty("contextTokens");
      expect(resolvedBudget).toBe(64_000);
      expect(snapshot.sourceConfigBeforeMigrations).toMatchObject(authored);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("models.providers.<provider>.models[].contextTokens"),
      );
      expect(snapshot.warnings).toContainEqual({
        path: "agents.defaults.contextTokens",
        message: "Removed agents.defaults.contextTokens.",
      });
      expect(snapshot.warnings).toContainEqual({
        path: "agents.defaults.contextTokens",
        message: expect.stringContaining("models.providers.<provider>.models[].contextTokens"),
      });
      expect(snapshot.warnings).not.toContainEqual(expect.objectContaining({ path: "" }));
      await expect(fs.readFile(configPath, "utf-8")).resolves.toBe(raw);
    });
  });

  it("logs each warning payload once until warnings clear", async () => {
    await withTempHome(async (home) => {
      const configPath = path.join(home, ".mangabaclaw", "mangabaclaw.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      const logger = {
        error: vi.fn(),
        warn: vi.fn(),
      };
      const load = () =>
        createConfigIO({
          configPath,
          env: { HOME: home } as NodeJS.ProcessEnv,
          homedir: () => home,
          logger,
        }).loadConfig();
      const writeRemovedPlugin = async (pluginId: string) => {
        await fs.writeFile(
          configPath,
          JSON.stringify({ plugins: { entries: { [pluginId]: { enabled: false } } } }),
        );
      };

      await writeRemovedPlugin("google-antigravity-auth");
      load();
      load();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        "Config warnings:\n- plugins.entries.google-antigravity-auth: plugin removed: google-antigravity-auth (stale config entry ignored; remove it from plugins config)",
      );

      createConfigIO({
        configPath,
        env: { HOME: home } as NodeJS.ProcessEnv,
        homedir: () => home,
        logger,
        pluginValidation: "skip",
      }).loadConfig();
      load();
      expect(logger.warn).toHaveBeenCalledTimes(1);

      await fs.writeFile(
        configPath,
        JSON.stringify({
          gateway: { port: "invalid" },
          plugins: { entries: { "google-antigravity-auth": { enabled: false } } },
        }),
      );
      expect(load).toThrow();
      await writeRemovedPlugin("google-antigravity-auth");
      load();
      expect(logger.warn).toHaveBeenCalledTimes(1);

      await writeRemovedPlugin("google-gemini-cli-auth");
      load();
      expect(logger.warn).toHaveBeenCalledTimes(2);

      await fs.writeFile(configPath, JSON.stringify({}));
      load();
      await writeRemovedPlugin("google-gemini-cli-auth");
      load();
      expect(logger.warn).toHaveBeenCalledTimes(3);

      // A null root is invalid config (throws) and, like the invalid-port
      // step above, preserves the logged-warning fingerprint.
      await fs.writeFile(configPath, "null");
      expect(load).toThrow();
      await writeRemovedPlugin("google-gemini-cli-auth");
      load();
      expect(logger.warn).toHaveBeenCalledTimes(3);
    });
  });

  it("explains what to check when config was written by a newer MangabaClaw", async () => {
    await withTempHome(async (home) => {
      const configPath = path.join(home, ".mangabaclaw", "mangabaclaw.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify(
          {
            meta: { lastTouchedVersion: "9999.1.1" },
            gateway: { mode: "local" },
          },
          null,
          2,
        ),
      );
      const logger = {
        error: vi.fn(),
        warn: vi.fn(),
      };

      const io = createConfigIO({
        configPath,
        env: { HOME: home } as NodeJS.ProcessEnv,
        homedir: () => home,
        logger,
      });
      io.loadConfig();

      expect(logger.warn).toHaveBeenCalledWith(
        [
          `Your MangabaClaw config was written by version 9999.1.1, but this command is running ${VERSION}.`,
          "Check: `mangabaclaw --version`, `which mangabaclaw`, and `mangabaclaw gateway status --deep`.",
          "If unexpected, update PATH so `mangabaclaw` points to the version you want, or reinstall the Gateway service from that same MangabaClaw install.",
        ].join("\n"),
      );
    });
  });

  it("does not warn about newer config during internal update handoff reads", async () => {
    await withTempHome(async (home) => {
      const configPath = path.join(home, ".mangabaclaw", "mangabaclaw.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify(
          {
            meta: { lastTouchedVersion: "9999.1.1" },
            gateway: { mode: "local" },
          },
          null,
          2,
        ),
      );
      const logger = {
        error: vi.fn(),
        warn: vi.fn(),
      };

      const io = createConfigIO({
        configPath,
        env: { HOME: home, MANGABACLAW_UPDATE_POST_CORE: "1" } as NodeJS.ProcessEnv,
        homedir: () => home,
        logger,
      });
      io.loadConfig();

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  it("normalizes safe-bin config entries at config load time", () => {
    const cfg = {
      tools: {
        exec: {
          safeBinTrustedDirs: [" /custom/bin ", "", "/custom/bin", "/agent/bin"],
          safeBinProfiles: {
            " MyFilter ": {
              allowedValueFlags: ["--limit", " --limit ", ""],
            },
          },
        },
      },
      agents: {
        list: [
          {
            id: "ops",
            tools: {
              exec: {
                safeBinTrustedDirs: [" /ops/bin ", "/ops/bin"],
                safeBinProfiles: {
                  " Custom ": {
                    deniedFlags: ["-f", " -f ", ""],
                  },
                },
              },
            },
          },
        ],
      },
    };
    normalizeExecSafeBinProfilesInConfig(cfg);
    expect(cfg.tools?.exec?.safeBinProfiles).toEqual({
      myfilter: {
        allowedValueFlags: ["--limit"],
      },
    });
    expect(cfg.tools?.exec?.safeBinTrustedDirs).toEqual(["/custom/bin", "/agent/bin"]);
    expect(cfg.agents?.list?.[0]?.tools?.exec?.safeBinProfiles).toEqual({
      custom: {
        deniedFlags: ["-f"],
      },
    });
    expect(cfg.agents?.list?.[0]?.tools?.exec?.safeBinTrustedDirs).toEqual(["/ops/bin"]);
  });
});
