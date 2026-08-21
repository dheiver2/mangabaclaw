/** Verifies plugin loader behavior for native module loading and resolver hooks. */
import fs from "node:fs";
import path from "node:path";
import { importFreshModule } from "mangabaclaw/plugin-sdk/test-fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempDirTracker } from "../../test/helpers/temp-dir.js";

const tempDirs = createTempDirTracker();

function writeBundledPluginFixture(id: string) {
  const pluginRoot = tempDirs.make("mangabaclaw-plugin-loader-");
  fs.writeFileSync(
    path.join(pluginRoot, "mangabaclaw.plugin.json"),
    JSON.stringify(
      {
        id,
        configSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(pluginRoot, "index.cjs"),
    `module.exports = { id: ${JSON.stringify(id)}, register() {} };`,
    "utf-8",
  );
  return pluginRoot;
}

function writePackagedPluginFixture(id: string) {
  const pluginRoot = tempDirs.make("mangabaclaw-plugin-loader-");
  fs.writeFileSync(
    path.join(pluginRoot, "package.json"),
    JSON.stringify(
      {
        name: id,
        type: "commonjs",
        mangabaclaw: {
          extensions: ["./index.cjs"],
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(pluginRoot, "mangabaclaw.plugin.json"),
    JSON.stringify(
      {
        id,
        configSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(pluginRoot, "index.cjs"),
    `module.exports = { id: ${JSON.stringify(id)}, register() {} };`,
    "utf-8",
  );
  return pluginRoot;
}

function writePreSplitSdkBridgeConsumerFixture() {
  const pluginRoot = tempDirs.make("mangabaclaw-plugin-loader-");
  fs.mkdirSync(path.join(pluginRoot, "dist"));
  fs.writeFileSync(
    path.join(pluginRoot, "package.json"),
    JSON.stringify(
      {
        name: "@mangabaclaw/sdk-bridge-consumer",
        version: "2026.7.2-beta.7",
        type: "module",
        mangabaclaw: {
          extensions: ["./dist/index.js"],
          runtimeExtensions: ["./dist/index.js"],
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(pluginRoot, "mangabaclaw.plugin.json"),
    JSON.stringify(
      {
        id: "sdk-bridge-consumer",
        configSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  // Import shapes copied from published 2026.7.2-beta.7 artifacts:
  // voice-call/matrix doctor contracts (runtime-doctor), whatsapp ack policy
  // (channel-feedback), slack progress-draft render (channel-outbound).
  // Covers both alias classes on purpose: runtime-doctor is private-local-only,
  // the channel subpaths are public. A source checkout has no dist/, so every
  // subpath listed here is evaluated through jiti — keep them light.
  fs.writeFileSync(
    path.join(pluginRoot, "dist", "index.js"),
    [
      'import { archiveLegacyStateSource, detectMangabaClawStateDatabaseSchemaMigrations, repairMangabaClawStateDatabaseSchema, detectPluginInstallPathIssue, formatPluginInstallPathIssue, removePluginFromConfig, createPluginStateSyncKeyedStore } from "mangabaclaw/plugin-sdk/runtime-doctor";',
      'import { shouldAckReactionForWhatsApp } from "mangabaclaw/plugin-sdk/channel-feedback";',
      'import { resolveChannelProgressDraftRender } from "mangabaclaw/plugin-sdk/channel-outbound";',
      'export default { id: "sdk-bridge-consumer", register() {',
      "  const bridged = [",
      "    archiveLegacyStateSource,",
      "    detectMangabaClawStateDatabaseSchemaMigrations,",
      "    repairMangabaClawStateDatabaseSchema,",
      "    detectPluginInstallPathIssue,",
      "    formatPluginInstallPathIssue,",
      "    removePluginFromConfig,",
      "    createPluginStateSyncKeyedStore,",
      "    shouldAckReactionForWhatsApp,",
      "    resolveChannelProgressDraftRender,",
      "  ];",
      '  if (bridged.some((entry) => typeof entry !== "function")) throw new Error("missing bridge");',
      "} };",
    ].join("\n"),
    "utf-8",
  );
  return pluginRoot;
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("./plugin-module-loader-cache.js");
  delete process.env.MANGABACLAW_BUNDLED_PLUGINS_DIR;
  tempDirs.cleanup();
});

function mockSourceLoaderCalls() {
  const sourceLoaderCalls: Array<{ modulePath: string; loaderFilename?: string }> = [];
  vi.doMock("./plugin-module-loader-cache.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./plugin-module-loader-cache.js")>();
    return {
      ...actual,
      getCachedPluginSourceModuleLoader: vi.fn((params) => {
        sourceLoaderCalls.push({
          modulePath: params.modulePath,
          loaderFilename: params.loaderFilename,
        });
        return vi.fn(() => ({
          default: {
            id: "source-fallback",
            register() {},
          },
        }));
      }),
    };
  });
  return sourceLoaderCalls;
}

describe("createPluginModuleLoader", () => {
  it("loads bundled JavaScript without creating a module loader", async () => {
    const sourceLoaderCalls = mockSourceLoaderCalls();

    const { loadMangabaClawPlugins } = await importFreshModule<typeof import("./loader.js")>(
      import.meta.url,
      "./loader.js?scope=native-module-loader",
    );

    const pluginRoot = writeBundledPluginFixture("demo");
    process.env.MANGABACLAW_BUNDLED_PLUGINS_DIR = pluginRoot;

    loadMangabaClawPlugins({
      cache: false,
      installRecords: {},
      workspaceDir: pluginRoot,
      onlyPluginIds: ["demo"],
      config: {
        plugins: {
          entries: {
            demo: {
              enabled: true,
            },
          },
        },
      },
    });

    expect(sourceLoaderCalls).toStrictEqual([]);
  });

  it("loads packaged JavaScript without creating a module loader", async () => {
    const sourceLoaderCalls = mockSourceLoaderCalls();

    const { loadMangabaClawPlugins } = await importFreshModule<typeof import("./loader.js")>(
      import.meta.url,
      "./loader.js?scope=packaged-native-module-loader",
    );

    const pluginRoot = writePackagedPluginFixture("npm-demo");
    process.env.MANGABACLAW_BUNDLED_PLUGINS_DIR = tempDirs.make("mangabaclaw-plugin-loader-");

    const registry = loadMangabaClawPlugins({
      cache: false,
      installRecords: {},
      onlyPluginIds: ["npm-demo"],
      config: {
        plugins: {
          enabled: true,
          load: {
            paths: [pluginRoot],
          },
          allow: ["npm-demo"],
          entries: {
            "npm-demo": {
              enabled: true,
            },
          },
        },
      },
    });

    expect(registry.plugins.find((plugin) => plugin.id === "npm-demo")?.status).toBe("loaded");
    expect(sourceLoaderCalls).toStrictEqual([]);
  });

  it("loads published pre-split SDK bridge imports (doctor repair, WhatsApp ack, Slack render)", async () => {
    const { loadMangabaClawPlugins } = await importFreshModule<typeof import("./loader.js")>(
      import.meta.url,
      "./loader.js?scope=sdk-bridge-upgrade-compat",
    );
    const pluginRoot = writePreSplitSdkBridgeConsumerFixture();
    process.env.MANGABACLAW_BUNDLED_PLUGINS_DIR = tempDirs.make("mangabaclaw-plugin-loader-");

    const registry = loadMangabaClawPlugins({
      cache: false,
      onlyPluginIds: ["sdk-bridge-consumer"],
      config: {
        plugins: {
          enabled: true,
          load: { paths: [pluginRoot] },
          allow: ["sdk-bridge-consumer"],
          entries: { "sdk-bridge-consumer": { enabled: true } },
        },
      },
    });

    const entry = registry.plugins.find((plugin) => plugin.id === "sdk-bridge-consumer");
    expect(entry?.error ?? null).toBeNull();
    expect(entry?.status).toBe("loaded");
  });
});
