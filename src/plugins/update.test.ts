import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expectDefined } from "@mangabaclaw/normalization-core";
import { bundledPluginRootAt } from "mangabaclaw/plugin-sdk/test-fixtures";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MangabaClawConfig } from "../config/config.js";
import { withEnvAsync } from "../test-utils/env.js";
import { makeTrackedTempDir } from "./test-helpers/fs-fixtures.js";

const APP_ROOT = "/app";

type NpmInstallIntegrityDrift = {
  spec: string;
  expectedIntegrity: string;
  actualIntegrity: string;
  resolution: {
    integrity?: string;
    resolvedSpec?: string;
    version?: string;
  };
};

const appBundledPluginRoot = (pluginId: string) => bundledPluginRootAt(APP_ROOT, pluginId);

function requireExpectedPluginId(params: { expectedPluginId?: string }): string {
  if (!params.expectedPluginId) {
    throw new Error("Expected npm install params to include expectedPluginId");
  }
  return params.expectedPluginId;
}

function requirePluginPackageName(
  plugins: Array<{ pluginId: string; packageName: string }>,
  pluginId: string,
): string {
  const plugin = plugins.find((candidate) => candidate.pluginId === pluginId);
  if (!plugin) {
    throw new Error(`Expected plugin fixture ${pluginId}`);
  }
  return plugin.packageName;
}

const installPluginFromNpmSpecMock = vi.fn();
const installPluginFromMarketplaceMock = vi.fn();
const installPluginFromClawHubMock = vi.fn();
const installPluginFromGitSpecMock = vi.fn();
const resolveBundledPluginSourcesMock = vi.fn();
const runCommandWithTimeoutMock = vi.fn();
const validatePackageExtensionEntriesForInstallMock = vi.fn();
const markClawPackageIndependentlyOwnedMock = vi.fn();
const withClawPackageLifecycleLeaseMock = vi.fn(
  async (_artifact: unknown, operation: () => Promise<unknown>, _options?: unknown) =>
    await operation(),
);
const tempDirs: string[] = [];

vi.mock("./install.js", () => ({
  installPluginFromNpmSpec: (...args: unknown[]) => installPluginFromNpmSpecMock(...args),
  resolvePluginInstallDir: (pluginId: string, extensionsDir = "/tmp") => {
    const separator = process.platform === "win32" ? "\\" : "/";
    return `${extensionsDir.replace(/[\\/]+$/, "")}${separator}${pluginId}`;
  },
  PLUGIN_INSTALL_ERROR_CODE: {
    NPM_METADATA_FAILURE: "npm_metadata_failure",
    NPM_PACKAGE_NOT_FOUND: "npm_package_not_found",
  },
}));

vi.mock("./git-install.js", () => ({
  installPluginFromGitSpec: (...args: unknown[]) => installPluginFromGitSpecMock(...args),
}));

vi.mock("./marketplace.js", () => ({
  installPluginFromMarketplace: (...args: unknown[]) => installPluginFromMarketplaceMock(...args),
}));

vi.mock("./clawhub.js", () => ({
  CLAWHUB_INSTALL_ERROR_CODE: {
    PACKAGE_NOT_FOUND: "package_not_found",
    VERSION_NOT_FOUND: "version_not_found",
    ARTIFACT_UNAVAILABLE: "artifact_unavailable",
    ARCHIVE_INTEGRITY_MISMATCH: "archive_integrity_mismatch",
    ARTIFACT_DOWNLOAD_UNAVAILABLE: "artifact_download_unavailable",
    CLAWHUB_SECURITY_UNAVAILABLE: "clawhub_security_unavailable",
    CLAWHUB_RISK_ACKNOWLEDGEMENT_REQUIRED: "clawhub_risk_acknowledgement_required",
    CLAWHUB_DOWNLOAD_BLOCKED: "clawhub_download_blocked",
  },
  installPluginFromClawHub: (...args: unknown[]) => installPluginFromClawHubMock(...args),
}));

vi.mock("../state/claw-package-adoption.js", () => ({
  markClawPackageIndependentlyOwned: (...args: unknown[]) =>
    markClawPackageIndependentlyOwnedMock(...args),
}));

vi.mock("../state/claw-package-lifecycle-lease.js", () => ({
  withClawPackageLifecycleLease: (
    artifact: unknown,
    operation: () => Promise<unknown>,
    options?: unknown,
  ) => withClawPackageLifecycleLeaseMock(artifact, operation, options),
}));

vi.mock("./bundled-sources.js", () => ({
  resolveBundledPluginSources: (...args: unknown[]) => resolveBundledPluginSourcesMock(...args),
}));

vi.mock("../process/exec.js", () => ({
  runCommandWithTimeout: (...args: unknown[]) => runCommandWithTimeoutMock(...args),
}));

vi.mock("./package-entry-resolution.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./package-entry-resolution.js")>();
  return {
    ...actual,
    validatePackageExtensionEntriesForInstall: async (
      ...args: Parameters<typeof actual.validatePackageExtensionEntriesForInstall>
    ) => {
      validatePackageExtensionEntriesForInstallMock(...args);
      return await actual.validatePackageExtensionEntriesForInstall(...args);
    },
  };
});

vi.resetModules();

const { syncPluginsForUpdateChannel, updateNpmInstalledPlugins } = await import("./update.js");

function createSuccessfulNpmUpdateResult(params?: {
  pluginId?: string;
  targetDir?: string;
  version?: string;
  npmResolution?: {
    name: string;
    version: string;
    resolvedSpec: string;
  };
}) {
  return {
    ok: true,
    pluginId: params?.pluginId ?? "opik-mangabaclaw",
    targetDir: params?.targetDir ?? "/tmp/opik-mangabaclaw",
    version: params?.version ?? "0.2.6",
    extensions: ["index.ts"],
    ...(params?.npmResolution ? { npmResolution: params.npmResolution } : {}),
  };
}

function createSuccessfulClawHubUpdateResult(params?: {
  pluginId?: string;
  targetDir?: string;
  version?: string;
  clawhubPackage?: string;
}) {
  return {
    ok: true,
    pluginId: params?.pluginId ?? "legacy-chat",
    targetDir: params?.targetDir ?? "/tmp/mangabaclaw-plugins/legacy-chat",
    version: params?.version ?? "2026.5.1-beta.2",
    extensions: ["index.ts"],
    packageName: params?.clawhubPackage ?? "legacy-chat",
    clawhub: {
      source: "clawhub" as const,
      clawhubUrl: "https://clawhub.ai",
      clawhubPackage: params?.clawhubPackage ?? "legacy-chat",
      clawhubFamily: "code-plugin" as const,
      clawhubChannel: "official" as const,
      version: params?.version ?? "2026.5.1-beta.2",
      integrity: "sha256-clawpack",
      resolvedAt: "2026-05-01T00:00:00.000Z",
      artifactKind: "npm-pack" as const,
      artifactFormat: "tgz" as const,
      npmIntegrity: "sha512-clawpack",
      npmShasum: "2".repeat(40),
      npmTarballName: `${params?.clawhubPackage ?? "legacy-chat"}-${params?.version ?? "2026.5.1-beta.2"}.tgz`,
      clawpackSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      clawpackSpecVersion: 1,
      clawpackManifestSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      clawpackSize: 4096,
    },
  };
}

function createNpmInstallConfig(params: {
  pluginId: string;
  spec: string;
  installPath: string;
  integrity?: string;
  shasum?: string;
  installedAt?: string;
  resolvedAt?: string;
  resolvedName?: string;
  resolvedSpec?: string;
  resolvedVersion?: string;
}) {
  return {
    plugins: {
      installs: {
        [params.pluginId]: {
          source: "npm" as const,
          spec: params.spec,
          installPath: params.installPath,
          ...(params.integrity ? { integrity: params.integrity } : {}),
          ...(params.shasum ? { shasum: params.shasum } : {}),
          ...(params.resolvedName ? { resolvedName: params.resolvedName } : {}),
          ...(params.resolvedSpec ? { resolvedSpec: params.resolvedSpec } : {}),
          ...(params.resolvedVersion ? { resolvedVersion: params.resolvedVersion } : {}),
          ...(params.installedAt ? { installedAt: params.installedAt } : {}),
          ...(params.resolvedAt ? { resolvedAt: params.resolvedAt } : {}),
        },
      },
    },
  };
}

function createMarketplaceInstallConfig(params: {
  pluginId: string;
  installPath: string;
  marketplaceSource: string;
  marketplacePlugin: string;
  marketplaceName?: string;
}): MangabaClawConfig {
  return {
    plugins: {
      installs: {
        [params.pluginId]: {
          source: "marketplace" as const,
          installPath: params.installPath,
          marketplaceSource: params.marketplaceSource,
          marketplacePlugin: params.marketplacePlugin,
          ...(params.marketplaceName ? { marketplaceName: params.marketplaceName } : {}),
        },
      },
    },
  };
}

function createClawHubInstallConfig(
  params: {
    pluginId?: string;
    installPath?: string;
    clawhubUrl?: string;
    clawhubPackage?: string;
    clawhubFamily?: "bundle-plugin" | "code-plugin";
    clawhubChannel?: "community" | "official" | "private";
    spec?: string;
  } = {},
): MangabaClawConfig {
  const pluginId = params.pluginId ?? "demo";
  const clawhubPackage = params.clawhubPackage ?? pluginId;
  return {
    plugins: {
      installs: {
        [pluginId]: {
          source: "clawhub" as const,
          spec: params.spec ?? `clawhub:${clawhubPackage}`,
          installPath: params.installPath ?? `/tmp/${pluginId}`,
          clawhubUrl: params.clawhubUrl ?? "https://clawhub.ai",
          clawhubPackage,
          clawhubFamily: params.clawhubFamily ?? "code-plugin",
          clawhubChannel: params.clawhubChannel ?? "official",
        },
      },
    },
  };
}

function createEnabledDemoClawHubInstallConfig(): MangabaClawConfig {
  const installPath = createInstalledPackageDir({
    name: "demo",
    version: "1.2.3",
  });
  const config = createClawHubInstallConfig({ installPath });
  config.plugins = {
    ...config.plugins,
    entries: {
      demo: {
        enabled: true,
        config: { preserved: true },
      },
    },
    allow: ["demo"],
    slots: {
      memory: "demo",
    },
  };
  return config;
}

function createGitInstallConfig(params: {
  pluginId: string;
  spec: string;
  installPath: string;
  commit?: string;
}): MangabaClawConfig {
  return {
    plugins: {
      installs: {
        [params.pluginId]: {
          source: "git" as const,
          spec: params.spec,
          installPath: params.installPath,
          ...(params.commit ? { gitCommit: params.commit } : {}),
        },
      },
    },
  };
}

function createBundledPathInstallConfig(params: {
  loadPaths: string[];
  installPath: string;
  sourcePath?: string;
  spec?: string;
}): MangabaClawConfig {
  return {
    plugins: {
      load: { paths: params.loadPaths },
      installs: {
        feishu: {
          source: "path",
          sourcePath: params.sourcePath ?? appBundledPluginRoot("feishu"),
          installPath: params.installPath,
          ...(params.spec ? { spec: params.spec } : {}),
        },
      },
    },
  };
}

function createCodexAppServerInstallConfig(params: {
  spec: string;
  resolvedName?: string;
  resolvedSpec?: string;
}) {
  return {
    plugins: {
      installs: {
        "mangabaclaw-codex-app-server": {
          source: "npm" as const,
          spec: params.spec,
          installPath: "/tmp/mangabaclaw-codex-app-server",
          ...(params.resolvedName ? { resolvedName: params.resolvedName } : {}),
          ...(params.resolvedSpec ? { resolvedSpec: params.resolvedSpec } : {}),
        },
      },
    },
  };
}

function createInstalledPackageDir(params: {
  name?: string;
  version: string;
  peerDependencies?: Record<string, string>;
  runnable?: boolean;
  installPath?: string;
}): string {
  const dir =
    params.installPath ?? fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-plugin-update-test-"));
  if (params.installPath) {
    fs.mkdirSync(dir, { recursive: true });
  } else {
    tempDirs.push(dir);
  }
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: params.name ?? "test-plugin",
        version: params.version,
        ...(params.peerDependencies ? { peerDependencies: params.peerDependencies } : {}),
        ...(params.runnable ? { mangabaclaw: { extensions: ["./index.js"] } } : {}),
      },
      null,
      2,
    ),
  );
  if (params.runnable) {
    fs.writeFileSync(path.join(dir, "index.js"), "export default function register() {}\n");
  }
  return dir;
}

function createMangabaClawPeerLinkFixtures(plugins: Array<{ pluginId: string; packageName: string }>) {
  const stateDir = makeTrackedTempDir("mangabaclaw-plugin-update-owner", tempDirs);
  const peerTarget = fs.realpathSync(process.cwd());
  const installPaths = Object.fromEntries(
    plugins.map(({ pluginId, packageName }) => [
      pluginId,
      createInstalledPackageDir({
        name: packageName,
        version: "2026.5.4",
        peerDependencies: { mangabaclaw: ">=2026.5.4" },
        installPath: path.join(stateDir, "extensions", pluginId),
      }),
    ]),
  );
  const peerLinkPath = (pluginId: string) =>
    path.join(
      expectDefined(installPaths[pluginId], "installPaths[pluginId] test invariant"),
      "node_modules",
      "mangabaclaw",
    );
  const linkPeer = (pluginId: string) => {
    fs.mkdirSync(path.dirname(peerLinkPath(pluginId)), { recursive: true });
    fs.symlinkSync(peerTarget, peerLinkPath(pluginId), "junction");
  };
  return { stateDir, installPaths, peerLinkPath, linkPeer };
}

function createPeerLinkInstallConfig(params: {
  plugins: Array<{ pluginId: string; packageName: string }>;
  installPaths: Record<string, string>;
  extraInstalls?: Record<string, PluginInstallRecord>;
}): MangabaClawConfig {
  return {
    plugins: {
      installs: {
        ...params.extraInstalls,
        ...Object.fromEntries(
          params.plugins.map(({ pluginId, packageName }) => [
            pluginId,
            {
              source: "npm",
              spec: packageName,
              installPath: params.installPaths[pluginId],
              resolvedName: packageName,
              resolvedVersion: "2026.5.4",
              resolvedSpec: `${packageName}@2026.5.4`,
              integrity: "sha512-same",
              shasum: "same",
            },
          ]),
        ),
      },
    },
  };
}

function mockNpmViewMetadata(params: {
  name: string;
  version: string;
  integrity?: string;
  shasum?: string;
  mangabaclaw?: Record<string, unknown>;
}) {
  runCommandWithTimeoutMock.mockResolvedValueOnce({
    code: 0,
    stdout: JSON.stringify({
      name: params.name,
      version: params.version,
      ...(params.integrity ? { "dist.integrity": params.integrity } : {}),
      ...(params.shasum ? { "dist.shasum": params.shasum } : {}),
      ...(params.mangabaclaw ? { mangabaclaw: params.mangabaclaw } : {}),
    }),
    stderr: "",
  });
}

function mockNpmViewVersions(versions: string[]) {
  runCommandWithTimeoutMock.mockResolvedValueOnce({
    code: 0,
    stdout: JSON.stringify(versions),
    stderr: "",
  });
}

function createNpmUpdateFixture(params: {
  pluginId: string;
  packageName: string;
  installedVersion: string;
  registryVersion?: string;
  registryIntegrity?: string;
  registryShasum?: string;
  registryMangabaClaw?: Record<string, unknown>;
  spec?: string;
  resolvedSpec?: string;
  integrity?: string;
  shasum?: string;
  installedAt?: string;
  resolvedAt?: string;
  installerVersion?: string;
  installerResolvedSpec?: string;
  peerDependencies?: Record<string, string>;
}) {
  const installPath = createInstalledPackageDir({
    name: params.packageName,
    version: params.installedVersion,
    ...(params.peerDependencies ? { peerDependencies: params.peerDependencies } : {}),
  });
  if (params.registryVersion) {
    mockNpmViewMetadata({
      name: params.packageName,
      version: params.registryVersion,
      ...(params.registryIntegrity ? { integrity: params.registryIntegrity } : {}),
      ...(params.registryShasum ? { shasum: params.registryShasum } : {}),
      ...(params.registryMangabaClaw ? { mangabaclaw: params.registryMangabaClaw } : {}),
    });
  }
  if (params.installerVersion) {
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: params.pluginId,
        targetDir: installPath,
        version: params.installerVersion,
        ...(params.installerResolvedSpec
          ? {
              npmResolution: {
                name: params.packageName,
                version: params.installerVersion,
                resolvedSpec: params.installerResolvedSpec,
              },
            }
          : {}),
      }),
    );
  }
  return {
    installPath,
    config: createNpmInstallConfig({
      pluginId: params.pluginId,
      spec: params.spec ?? params.packageName,
      installPath,
      resolvedName: params.packageName,
      resolvedSpec: params.resolvedSpec ?? `${params.packageName}@${params.installedVersion}`,
      resolvedVersion: params.installedVersion,
      ...(params.integrity ? { integrity: params.integrity } : {}),
      ...(params.shasum ? { shasum: params.shasum } : {}),
      ...(params.installedAt ? { installedAt: params.installedAt } : {}),
      ...(params.resolvedAt ? { resolvedAt: params.resolvedAt } : {}),
    }),
  };
}

function npmInstallCall(index = 0): Record<string, unknown> | undefined {
  const calls = installPluginFromNpmSpecMock.mock.calls as unknown as Array<
    [Record<string, unknown>]
  >;
  return calls[index]?.[0];
}

function clawHubInstallCall(index = 0): Record<string, unknown> | undefined {
  const calls = installPluginFromClawHubMock.mock.calls as unknown as Array<
    [Record<string, unknown>]
  >;
  return calls[index]?.[0];
}

function marketplaceInstallCall(index = 0): Record<string, unknown> | undefined {
  const calls = installPluginFromMarketplaceMock.mock.calls as unknown as Array<
    [Record<string, unknown>]
  >;
  return calls[index]?.[0];
}

function gitInstallCall(index = 0): Record<string, unknown> | undefined {
  const calls = installPluginFromGitSpecMock.mock.calls as unknown as Array<
    [Record<string, unknown>]
  >;
  return calls[index]?.[0];
}

function npmViewCall(): [unknown, Record<string, unknown>] | undefined {
  const calls = runCommandWithTimeoutMock.mock.calls as unknown as Array<
    [unknown, Record<string, unknown>]
  >;
  return calls.find(([argv]) => Array.isArray(argv) && argv[0] === "npm" && argv[1] === "view");
}

function expectRecordFields(
  actual: Record<string, unknown> | undefined,
  expected: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(expected)) {
    expect(actual?.[key]).toEqual(value);
  }
}

function expectNpmUpdateCall(params: {
  spec: string;
  expectedIntegrity?: string;
  expectedPluginId?: string;
  timeoutMs?: number;
}) {
  const call = npmInstallCall();
  expect(call?.spec).toBe(params.spec);
  expect(call?.expectedIntegrity).toBe(params.expectedIntegrity);
  if (params.expectedPluginId) {
    expect(call?.expectedPluginId).toBe(params.expectedPluginId);
  }
  if (params.timeoutMs) {
    expect(call?.timeoutMs).toBe(params.timeoutMs);
  }
}

function createBundledSource(params?: { pluginId?: string; localPath?: string; npmSpec?: string }) {
  const pluginId = params?.pluginId ?? "feishu";
  return {
    pluginId,
    localPath: params?.localPath ?? appBundledPluginRoot(pluginId),
    npmSpec: params?.npmSpec ?? `@mangabaclaw/${pluginId}`,
  };
}

type ExternalizedPluginBridge = NonNullable<
  Parameters<typeof syncPluginsForUpdateChannel>[0]["externalizedBundledPluginBridges"]
>[number];
type PluginInstallRecord = NonNullable<NonNullable<MangabaClawConfig["plugins"]>["installs"]>[string];

function createDisabledPluginConfig(install: PluginInstallRecord): MangabaClawConfig {
  return {
    plugins: {
      entries: { demo: { enabled: false, config: { preserved: true } } },
      installs: { demo: install },
    },
  };
}

function createExternalizedPluginBridge(
  overrides: Partial<ExternalizedPluginBridge> = {},
): ExternalizedPluginBridge {
  return {
    bundledPluginId: "legacy-chat",
    npmSpec: "@mangabaclaw/legacy-chat",
    channelIds: ["legacy-chat"],
    ...overrides,
  };
}

function createExternalizedPluginConfig(params?: {
  pluginId?: string;
  channelEnabled?: boolean;
  entryEnabled?: boolean;
  includeLoad?: boolean;
  loadPaths?: string[];
  install?: PluginInstallRecord;
}): MangabaClawConfig {
  const pluginId = params?.pluginId ?? "legacy-chat";
  const bundledRoot = appBundledPluginRoot(pluginId);
  return {
    ...(params?.channelEnabled === false ? {} : { channels: { [pluginId]: { enabled: true } } }),
    plugins: {
      ...(params?.entryEnabled === undefined
        ? {}
        : { entries: { [pluginId]: { enabled: params.entryEnabled } } }),
      ...(params?.includeLoad === false
        ? {}
        : { load: { paths: params?.loadPaths ?? [bundledRoot] } }),
      installs: {
        [pluginId]:
          params?.install ??
          ({ source: "path", sourcePath: bundledRoot, installPath: bundledRoot } as const),
      },
    },
  };
}

function syncExternalizedPlugin(params: {
  config?: MangabaClawConfig;
  bridge?: Partial<ExternalizedPluginBridge>;
  channel?: "stable" | "beta" | "extended-stable";
  coreVersion?: string;
  acknowledgeClawHubRisk?: boolean;
  onClawHubRisk?: Parameters<typeof syncPluginsForUpdateChannel>[0]["onClawHubRisk"];
}) {
  return syncPluginsForUpdateChannel({
    channel: params.channel ?? "stable",
    ...(params.coreVersion ? { coreVersion: params.coreVersion } : {}),
    ...(params.acknowledgeClawHubRisk ? { acknowledgeClawHubRisk: true } : {}),
    ...(params.onClawHubRisk ? { onClawHubRisk: params.onClawHubRisk } : {}),
    externalizedBundledPluginBridges: [createExternalizedPluginBridge(params.bridge)],
    config: params.config ?? createExternalizedPluginConfig(),
  });
}

function mockBundledSources(...sources: ReturnType<typeof createBundledSource>[]) {
  resolveBundledPluginSourcesMock.mockReturnValue(
    new Map(sources.map((source) => [source.pluginId, source])),
  );
}

function expectBundledPathInstall(params: {
  install: Record<string, unknown> | undefined;
  sourcePath: string;
  installPath: string;
  spec?: string;
}) {
  expect(params.install?.source).toBe("path");
  expect(params.install?.sourcePath).toBe(params.sourcePath);
  expect(params.install?.installPath).toBe(params.installPath);
  if (params.spec) {
    expect(params.install?.spec).toBe(params.spec);
  }
}

function expectCodexAppServerInstallState(params: {
  result: Awaited<ReturnType<typeof updateNpmInstalledPlugins>>;
  spec: string;
  version: string;
  resolvedSpec?: string;
}) {
  const install = params.result.config.plugins?.installs?.["mangabaclaw-codex-app-server"];
  expect(install?.source).toBe("npm");
  expect(install?.spec).toBe(params.spec);
  expect(install?.installPath).toBe("/tmp/mangabaclaw-codex-app-server");
  expect(install?.version).toBe(params.version);
  if (params.resolvedSpec) {
    expect(install?.resolvedSpec).toBe(params.resolvedSpec);
  }
}

type UpdateInstalledPluginParams = Parameters<typeof updateNpmInstalledPlugins>[0];

function updatePlugin(
  config: MangabaClawConfig,
  pluginId: string,
  params: Omit<UpdateInstalledPluginParams, "config" | "pluginIds"> = {},
) {
  return updateNpmInstalledPlugins({ config, pluginIds: [pluginId], ...params });
}

describe("updateNpmInstalledPlugins", () => {
  let timeoutBudgetCase: {
    installCall: Record<string, unknown> | undefined;
    npmViewTimeoutMs: unknown;
  };

  beforeAll(async () => {
    installPluginFromNpmSpecMock.mockReset();
    installPluginFromMarketplaceMock.mockReset();
    installPluginFromClawHubMock.mockReset();
    installPluginFromGitSpecMock.mockReset();
    resolveBundledPluginSourcesMock.mockReset();
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    runCommandWithTimeoutMock.mockReset();
    validatePackageExtensionEntriesForInstallMock.mockReset();
    markClawPackageIndependentlyOwnedMock.mockReset();
    withClawPackageLifecycleLeaseMock
      .mockReset()
      .mockImplementation(
        async (_artifact: unknown, operation: () => Promise<unknown>) => await operation(),
      );
    const { config } = createNpmUpdateFixture({
      pluginId: "lossless-claw",
      packageName: "@martian-engineering/lossless-claw",
      installedVersion: "0.9.0",
      registryVersion: "0.10.0",
      registryIntegrity: "sha512-next",
      installerVersion: "0.10.0",
    });
    await updatePlugin(config, "lossless-claw", { timeoutMs: 1_800_000 });

    timeoutBudgetCase = {
      installCall: npmInstallCall(),
      npmViewTimeoutMs: npmViewCall()?.[1]?.timeoutMs,
    };
  });

  beforeEach(() => {
    installPluginFromNpmSpecMock.mockReset();
    installPluginFromMarketplaceMock.mockReset();
    installPluginFromClawHubMock.mockReset();
    installPluginFromGitSpecMock.mockReset();
    resolveBundledPluginSourcesMock.mockReset();
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    runCommandWithTimeoutMock.mockReset();
    validatePackageExtensionEntriesForInstallMock.mockReset();
  });

  it("moves only the replaced npm plugin's exact explicit load path", async () => {
    const previousInstallPath = createInstalledPackageDir({
      name: "@acme/demo",
      version: "1.0.0",
    });
    const nextInstallPath = createInstalledPackageDir({
      name: "@acme/demo",
      version: "2.0.0",
    });
    const adjacentInstallPath = createInstalledPackageDir({
      name: "@acme/adjacent",
      version: "1.0.0",
    });
    const customPath = path.join(previousInstallPath, "custom-child");
    mockNpmViewMetadata({ name: "@acme/demo", version: "2.0.0" });
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "demo",
        targetDir: nextInstallPath,
        version: "2.0.0",
        npmResolution: {
          name: "@acme/demo",
          version: "2.0.0",
          resolvedSpec: "@acme/demo@2.0.0",
        },
      }),
    );
    const adjacentRecord = {
      source: "npm" as const,
      spec: "@acme/adjacent@1.0.0",
      installPath: adjacentInstallPath,
    };

    const result = await updateNpmInstalledPlugins({
      config: {
        plugins: {
          load: {
            paths: [customPath, previousInstallPath, adjacentInstallPath],
          },
          installs: {
            demo: {
              source: "npm",
              spec: "@acme/demo@1.0.0",
              installPath: previousInstallPath,
              resolvedName: "@acme/demo",
              resolvedSpec: "@acme/demo@1.0.0",
              resolvedVersion: "1.0.0",
            },
            adjacent: adjacentRecord,
          },
        },
      },
      pluginIds: ["demo"],
    });

    expect(result.changed).toBe(true);
    expect(result.config.plugins?.load?.paths).toEqual([
      customPath,
      nextInstallPath,
      adjacentInstallPath,
    ]);
    expect(result.config.plugins?.installs?.adjacent).toEqual(adjacentRecord);
  });

  it("preserves explicit load paths when the npm replacement fails", async () => {
    const previousInstallPath = createInstalledPackageDir({
      name: "@acme/demo",
      version: "1.0.0",
    });
    const customPath = "/tmp/custom-demo";
    mockNpmViewMetadata({ name: "@acme/demo", version: "2.0.0" });
    installPluginFromNpmSpecMock.mockResolvedValue({
      ok: false,
      error: "npm install failed",
    });
    const config = {
      plugins: {
        load: { paths: [previousInstallPath, customPath] },
        installs: {
          demo: {
            source: "npm" as const,
            spec: "@acme/demo@1.0.0",
            installPath: previousInstallPath,
            resolvedName: "@acme/demo",
            resolvedSpec: "@acme/demo@1.0.0",
            resolvedVersion: "1.0.0",
          },
        },
      },
    } satisfies MangabaClawConfig;

    const result = await updateNpmInstalledPlugins({ config, pluginIds: ["demo"] });

    expect(result.changed).toBe(false);
    expect(result.config).toBe(config);
    expect(result.config.plugins?.load?.paths).toEqual([previousInstallPath, customPath]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not treat inherited prototype names as install records", async () => {
    const config: MangabaClawConfig = { plugins: { installs: {} } };

    const result = await updatePlugin(config, "constructor");

    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expect(result.config).toBe(config);
    expect(result.outcomes).toEqual([
      {
        pluginId: "constructor",
        status: "skipped",
        message: 'No install record for "constructor".',
      },
    ]);
  });

  it.each([
    {
      name: "skips integrity drift checks for unpinned npm specs during dry-run updates",
      config: createNpmInstallConfig({
        pluginId: "opik-mangabaclaw",
        spec: "@opik/opik-mangabaclaw",
        integrity: "sha512-old",
        installPath: "/tmp/opik-mangabaclaw",
      }),
      pluginIds: ["opik-mangabaclaw"],
      dryRun: true,
      expectedCall: {
        spec: "@opik/opik-mangabaclaw",
        expectedIntegrity: undefined,
      },
    },
    {
      name: "keeps integrity drift checks for exact-version npm specs during dry-run updates",
      config: createNpmInstallConfig({
        pluginId: "opik-mangabaclaw",
        spec: "@opik/opik-mangabaclaw@0.2.5",
        integrity: "sha512-old",
        installPath: "/tmp/opik-mangabaclaw",
      }),
      pluginIds: ["opik-mangabaclaw"],
      dryRun: true,
      expectedCall: {
        spec: "@opik/opik-mangabaclaw@0.2.5",
        expectedIntegrity: "sha512-old",
      },
    },
    {
      name: "skips recorded integrity checks when an explicit npm version override changes the spec",
      config: createNpmInstallConfig({
        pluginId: "mangabaclaw-codex-app-server",
        spec: "mangabaclaw-codex-app-server@0.2.0-beta.3",
        integrity: "sha512-old",
        installPath: "/tmp/mangabaclaw-codex-app-server",
      }),
      pluginIds: ["mangabaclaw-codex-app-server"],
      specOverrides: {
        "mangabaclaw-codex-app-server": "mangabaclaw-codex-app-server@0.2.0-beta.4",
      },
      installerResult: createSuccessfulNpmUpdateResult({
        pluginId: "mangabaclaw-codex-app-server",
        targetDir: "/tmp/mangabaclaw-codex-app-server",
        version: "0.2.0-beta.4",
      }),
      expectedCall: {
        spec: "mangabaclaw-codex-app-server@0.2.0-beta.4",
        expectedIntegrity: undefined,
      },
    },
  ] as const)(
    "$name",
    async ({ config, pluginIds, dryRun, specOverrides, installerResult, expectedCall }) => {
      installPluginFromNpmSpecMock.mockResolvedValue(
        installerResult ?? createSuccessfulNpmUpdateResult(),
      );

      await updateNpmInstalledPlugins({
        config,
        pluginIds: [...pluginIds],
        ...(dryRun ? { dryRun: true } : {}),
        ...(specOverrides ? { specOverrides } : {}),
      });

      expectNpmUpdateCall(expectedCall);
    },
  );

  it("passes timeout budget to npm plugin metadata checks and installs", async () => {
    expect(timeoutBudgetCase.npmViewTimeoutMs).toBe(1_800_000);
    expectRecordFields(timeoutBudgetCase.installCall, {
      spec: "@martian-engineering/lossless-claw",
      expectedPluginId: "lossless-claw",
      timeoutMs: 1_800_000,
    });
  });

  it("trusts official catalog npm updates when the installed package matches the catalog", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@mangabaclaw/acpx",
      installedVersion: "2026.5.2-beta.1",
      registryVersion: "2026.5.2-beta.2",
      installerVersion: "2026.5.2-beta.2",
      installerResolvedSpec: "@mangabaclaw/acpx@2026.5.2-beta.2",
    });

    const result = await updatePlugin(config, "acpx", { syncOfficialPluginInstalls: true });

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/acpx");
    expect(npmInstallCall()?.expectedPluginId).toBe("acpx");
    expect(npmInstallCall()?.trustedSourceLinkedOfficialInstall).toBe(true);
    expect(result.config.plugins?.installs?.acpx?.spec).toBe("@mangabaclaw/acpx@2026.5.2-beta.2");
  });

  it.each([
    {
      name: "inferred beta",
      channel: "beta" as const,
      configuredChannel: undefined,
      registryVersion: "2026.5.3-beta.1",
      expectedSpec: "@mangabaclaw/codex@beta",
    },
    {
      name: "inferred stable",
      channel: "stable" as const,
      configuredChannel: undefined,
      registryVersion: "2026.5.3",
      expectedSpec: "@mangabaclaw/codex",
    },
    {
      name: "configured stable over inferred beta",
      channel: "beta" as const,
      configuredChannel: "stable" as const,
      registryVersion: "2026.5.3",
      expectedSpec: "@mangabaclaw/codex",
    },
  ])(
    "uses the $name channel for a targeted floating official npm update",
    async ({ channel, configuredChannel, registryVersion, expectedSpec }) => {
      const { config } = createNpmUpdateFixture({
        pluginId: "codex",
        packageName: "@mangabaclaw/codex",
        installedVersion: "2026.5.2",
        registryVersion,
        installerVersion: registryVersion,
        installerResolvedSpec: `@mangabaclaw/codex@${registryVersion}`,
      });

      const result = await updatePlugin(config, "codex", {
        officialPluginUpdateChannel: channel,
        ...(configuredChannel ? { updateChannel: configuredChannel } : {}),
      });

      expect(npmInstallCall()?.spec).toBe(expectedSpec);
      expect(result.config.plugins?.installs?.codex?.spec).toBe("@mangabaclaw/codex");
      expect(result.config.plugins?.installs?.codex?.resolvedSpec).toBe(
        `@mangabaclaw/codex@${registryVersion}`,
      );
    },
  );

  it("retains the default fallback for a targeted official beta update", async () => {
    installPluginFromNpmSpecMock
      .mockResolvedValueOnce({
        ok: false,
        code: "npm_package_not_found",
        error: "No matching version found for @mangabaclaw/codex@beta",
      })
      .mockResolvedValueOnce(
        createSuccessfulNpmUpdateResult({
          pluginId: "codex",
          targetDir: "/tmp/codex",
          version: "2026.5.3",
          npmResolution: {
            name: "@mangabaclaw/codex",
            version: "2026.5.3",
            resolvedSpec: "@mangabaclaw/codex@2026.5.3",
          },
        }),
      );
    const config = createNpmInstallConfig({
      pluginId: "codex",
      spec: "@mangabaclaw/codex",
      installPath: "/tmp/codex",
      resolvedName: "@mangabaclaw/codex",
    });

    const result = await updatePlugin(config, "codex", {
      officialPluginUpdateChannel: "beta",
    });

    expect(npmInstallCall(0)?.spec).toBe("@mangabaclaw/codex@beta");
    expect(npmInstallCall(1)?.spec).toBe("@mangabaclaw/codex");
    expect(result.config.plugins?.installs?.codex?.spec).toBe("@mangabaclaw/codex");
  });

  it("pins unchanged official npm records during official sync", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@mangabaclaw/acpx",
      installedVersion: "2026.5.2",
      registryVersion: "2026.5.2",
      registryIntegrity: "sha512-old",
      integrity: "sha512-old",
      installedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: "2026-05-01T00:00:01.000Z",
    });
    const result = await updatePlugin(config, "acpx", { syncOfficialPluginInstalls: true });

    expect(result.changed).toBe(true);
    expect(result.outcomes[0]?.status).toBe("unchanged");
    expect(result.config.plugins?.installs?.acpx?.spec).toBe("@mangabaclaw/acpx@2026.5.2");
    expect(result.config.plugins?.installs?.acpx?.installedAt).toBe("2026-05-01T00:00:00.000Z");
    expect(result.config.plugins?.installs?.acpx?.resolvedAt).toBe("2026-05-01T00:00:01.000Z");
    expect(npmInstallCall()).toBeUndefined();
  });

  it("keeps integrity drift checks for exact official pins during official sync", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@mangabaclaw/acpx",
      installedVersion: "2026.5.2",
      registryVersion: "2026.5.2",
      registryIntegrity: "sha512-new",
      spec: "@mangabaclaw/acpx@2026.5.2",
      integrity: "sha512-old",
      installerVersion: "2026.5.2",
      installerResolvedSpec: "@mangabaclaw/acpx@2026.5.2",
    });

    await updatePlugin(config, "acpx", { syncOfficialPluginInstalls: true });

    expectNpmUpdateCall({
      spec: "@mangabaclaw/acpx",
      expectedPluginId: "acpx",
      expectedIntegrity: "sha512-old",
    });
  });

  it("skips integrity checks when official sync may choose a compatible fallback", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@mangabaclaw/acpx",
      installedVersion: "2026.5.2",
      registryVersion: "2026.5.2",
      registryIntegrity: "sha512-old",
      registryMangabaClaw: { compat: { pluginApi: ">=9999.0.0" } },
      spec: "@mangabaclaw/acpx@2026.5.2",
      integrity: "sha512-old",
      installerVersion: "2026.5.1",
      installerResolvedSpec: "@mangabaclaw/acpx@2026.5.1",
    });

    await updatePlugin(config, "acpx", { syncOfficialPluginInstalls: true });

    expectNpmUpdateCall({
      spec: "@mangabaclaw/acpx",
      expectedPluginId: "acpx",
      expectedIntegrity: undefined,
    });
  });

  it("keeps integrity drift checks when official latest falls back to pinned stable", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@mangabaclaw/acpx",
      installedVersion: "2026.5.2",
      registryVersion: "2026.5.3-beta.1",
      registryIntegrity: "sha512-beta",
      spec: "@mangabaclaw/acpx@2026.5.2",
      integrity: "sha512-old",
      installerVersion: "2026.5.2",
      installerResolvedSpec: "@mangabaclaw/acpx@2026.5.2",
    });
    mockNpmViewVersions(["2026.5.2", "2026.5.3-beta.1"]);
    mockNpmViewMetadata({
      name: "@mangabaclaw/acpx",
      version: "2026.5.2",
      integrity: "sha512-old",
    });

    await updatePlugin(config, "acpx", { syncOfficialPluginInstalls: true });

    expectNpmUpdateCall({
      spec: "@mangabaclaw/acpx",
      expectedPluginId: "acpx",
      expectedIntegrity: "sha512-old",
    });
  });

  it("keeps integrity drift checks for exact prerelease-only official pins", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "voice-call",
      packageName: "@mangabaclaw/voice-call",
      installedVersion: "0.0.2-beta.1",
      registryVersion: "0.0.2-beta.1",
      registryIntegrity: "sha512-beta",
      spec: "@mangabaclaw/voice-call@0.0.2-beta.1",
      integrity: "sha512-old",
      installerVersion: "0.0.2-beta.1",
      installerResolvedSpec: "@mangabaclaw/voice-call@0.0.2-beta.1",
    });
    mockNpmViewVersions(["0.0.1-beta.1", "0.0.2-beta.1"]);

    await updatePlugin(config, "voice-call", { syncOfficialPluginInstalls: true });

    expectNpmUpdateCall({
      spec: "@mangabaclaw/voice-call",
      expectedPluginId: "voice-call",
      expectedIntegrity: "sha512-old",
    });
  });

  it.each([
    {
      name: "keeps integrity drift checks for exact official pins during beta fallback",
      fallbackMetadata: [{ version: "2026.5.2", integrity: "sha512-old" }],
      installerVersion: "2026.5.2",
      expectedIntegrity: "sha512-old",
    },
    {
      name: "keeps integrity checks when beta fallback bare spec resolves to a prerelease first",
      fallbackMetadata: [
        { version: "2026.5.3-beta.1", integrity: "sha512-beta" },
        { versions: ["2026.5.2", "2026.5.3-beta.1"] },
        { version: "2026.5.2", integrity: "sha512-old" },
      ],
      installerVersion: "2026.5.2",
      expectedIntegrity: "sha512-old",
    },
    {
      name: "skips fallback integrity checks when official fallback may choose a compatible version",
      fallbackMetadata: [
        {
          version: "2026.5.2",
          integrity: "sha512-old",
          mangabaclaw: { compat: { pluginApi: ">=9999.0.0" } },
        },
      ],
      installerVersion: "2026.5.1",
      expectedIntegrity: undefined,
    },
  ])("$name", async ({ fallbackMetadata, installerVersion, expectedIntegrity }) => {
    const { installPath, config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@mangabaclaw/acpx",
      installedVersion: "2026.5.2",
      registryVersion: "2026.5.3-beta.1",
      registryIntegrity: "sha512-beta",
      spec: "@mangabaclaw/acpx@2026.5.2",
      integrity: "sha512-old",
    });
    for (const metadata of fallbackMetadata) {
      if ("versions" in metadata && metadata.versions) {
        mockNpmViewVersions(metadata.versions);
      } else {
        mockNpmViewMetadata({ name: "@mangabaclaw/acpx", ...metadata });
      }
    }
    installPluginFromNpmSpecMock
      .mockResolvedValueOnce({
        ok: false,
        error: "No matching version found for @mangabaclaw/acpx@beta",
        code: "npm_package_not_found",
      })
      .mockResolvedValueOnce(
        createSuccessfulNpmUpdateResult({
          pluginId: "acpx",
          targetDir: installPath,
          version: installerVersion,
          npmResolution: {
            name: "@mangabaclaw/acpx",
            version: installerVersion,
            resolvedSpec: `@mangabaclaw/acpx@${installerVersion}`,
          },
        }),
      );

    await updatePlugin(config, "acpx", {
      syncOfficialPluginInstalls: true,
      updateChannel: "beta",
    });

    expect(npmInstallCall(0)?.spec).toBe("@mangabaclaw/acpx@beta");
    expect(npmInstallCall(0)?.expectedIntegrity).toBeUndefined();
    expect(npmInstallCall(1)?.spec).toBe("@mangabaclaw/acpx");
    expect(npmInstallCall(1)?.expectedIntegrity).toBe(expectedIntegrity);
  });

  it("keeps third-party moving npm specs when their updates resolve exact artifacts", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "lossless-claw",
      packageName: "@martian-engineering/lossless-claw",
      installedVersion: "0.9.0",
      registryVersion: "0.9.1",
      installerVersion: "0.9.1",
      installerResolvedSpec: "@martian-engineering/lossless-claw@0.9.1",
    });
    const result = await updatePlugin(config, "lossless-claw");

    expect(result.config.plugins?.installs?.["lossless-claw"]?.spec).toBe(
      "@martian-engineering/lossless-claw",
    );
    expect(result.config.plugins?.installs?.["lossless-claw"]?.resolvedSpec).toBe(
      "@martian-engineering/lossless-claw@0.9.1",
    );
  });

  it("does not apply a targeted official beta channel to third-party npm specs", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "lossless-claw",
      packageName: "@martian-engineering/lossless-claw",
      installedVersion: "0.9.0",
      registryVersion: "0.9.1",
      installerVersion: "0.9.1",
      installerResolvedSpec: "@martian-engineering/lossless-claw@0.9.1",
    });
    await updatePlugin(config, "lossless-claw", {
      officialPluginUpdateChannel: "beta",
    });

    expect(npmInstallCall()?.spec).toBe("@martian-engineering/lossless-claw");
  });

  it("does not skip trusted official default updates when latest resolves to the installed prerelease", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@mangabaclaw/acpx",
      installedVersion: "2026.5.2-beta.2",
      registryVersion: "2026.5.2-beta.2",
      registryIntegrity: "sha512-beta",
      registryShasum: "beta",
      spec: "@mangabaclaw/acpx@2026.5.2-beta.2",
      integrity: "sha512-beta",
      shasum: "beta",
      installerVersion: "2026.5.2",
      installerResolvedSpec: "@mangabaclaw/acpx@2026.5.2",
    });
    const result = await updatePlugin(config, "acpx", { syncOfficialPluginInstalls: true });

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/acpx");
    expect(npmInstallCall()?.expectedIntegrity).toBeUndefined();
    expect(npmInstallCall()?.expectedPluginId).toBe("acpx");
    expect(npmInstallCall()?.trustedSourceLinkedOfficialInstall).toBe(true);
    expect(result.outcomes[0]?.pluginId).toBe("acpx");
    expect(result.outcomes[0]?.status).toBe("updated");
    expect(result.outcomes[0]?.currentVersion).toBe("2026.5.2-beta.2");
    expect(result.outcomes[0]?.nextVersion).toBe("2026.5.2");
  });

  it("updates trusted official npm plugins when latest resolves to a stable correction release", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@mangabaclaw/acpx",
      installedVersion: "2026.5.3",
      registryVersion: "2026.5.3-1",
      registryIntegrity: "sha512-correction",
      registryShasum: "correction",
      installerVersion: "2026.5.3-1",
      installerResolvedSpec: "@mangabaclaw/acpx@2026.5.3-1",
    });
    const result = await updatePlugin(config, "acpx");

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/acpx");
    expect(npmInstallCall()?.expectedPluginId).toBe("acpx");
    expect(npmInstallCall()?.trustedSourceLinkedOfficialInstall).toBe(true);
    expect(result.outcomes[0]?.pluginId).toBe("acpx");
    expect(result.outcomes[0]?.status).toBe("updated");
    expect(result.outcomes[0]?.currentVersion).toBe("2026.5.3");
    expect(result.outcomes[0]?.nextVersion).toBe("2026.5.3-1");
  });

  it("does not trust official npm updates when the install record package mismatches", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@vendor/acpx-fork",
      installedVersion: "1.0.0",
      registryVersion: "1.0.1",
      installerVersion: "1.0.1",
    });
    await updatePlugin(config, "acpx");

    expect(npmInstallCall()?.trustedSourceLinkedOfficialInstall).not.toBe(true);
  });

  it("skips npm reinstall and config rewrite when the installed artifact is unchanged", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "lossless-claw",
      packageName: "@martian-engineering/lossless-claw",
      installedVersion: "0.9.0",
      registryVersion: "0.9.0",
      registryIntegrity: "sha512-same",
      registryShasum: "same",
      integrity: "sha512-same",
      shasum: "same",
    });
    installPluginFromNpmSpecMock.mockRejectedValue(new Error("installer should not run"));

    const result = await updatePlugin(config, "lossless-claw");

    expect(npmViewCall()?.[0]).toEqual([
      "npm",
      "view",
      "@martian-engineering/lossless-claw",
      "name",
      "version",
      "dist.integrity",
      "dist.shasum",
      "mangabaclaw",
      "--json",
    ]);
    if (npmViewCall()?.[1] === undefined) {
      throw new Error("Expected npm view command options");
    }
    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expect(result.config).toBe(config);
    expect(result.outcomes).toEqual([
      {
        pluginId: "lossless-claw",
        status: "unchanged",
        currentVersion: "0.9.0",
        nextVersion: "0.9.0",
        message: "lossless-claw is up to date (0.9.0).",
      },
    ]);
  });

  it.each([
    {
      name: "latest",
      updateChannel: undefined,
      registrySpec: "@acme/demo",
      registryVersion: "1.2.4",
      overrideSpec: "@acme/demo@latest",
    },
    {
      name: "beta",
      updateChannel: "beta" as const,
      registrySpec: "@acme/demo@beta",
      registryVersion: "1.3.0-beta.1",
      overrideSpec: "@acme/demo@beta",
    },
  ])(
    "reports newer $name releases for exact-pinned installed records instead of claiming up to date",
    async ({ updateChannel, registrySpec, registryVersion, overrideSpec }) => {
      const { config } = createNpmUpdateFixture({
        pluginId: "demo",
        packageName: "@acme/demo",
        installedVersion: "1.2.3",
        registryVersion: "1.2.3",
        registryIntegrity: "sha512-same",
        registryShasum: "same",
        spec: "@acme/demo@1.2.3",
        integrity: "sha512-same",
        shasum: "same",
        installedAt: "2026-07-01T00:00:00.000Z",
        resolvedAt: "2026-07-01T00:00:01.000Z",
      });
      mockNpmViewMetadata({
        name: "@acme/demo",
        version: registryVersion,
      });
      installPluginFromNpmSpecMock.mockRejectedValue(new Error("installer should not run"));

      const result = await updatePlugin(config, "demo", updateChannel ? { updateChannel } : {});

      expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
      expect(runCommandWithTimeoutMock.mock.calls).toHaveLength(2);
      expect(runCommandWithTimeoutMock.mock.calls[1]?.[0]).toEqual([
        "npm",
        "view",
        registrySpec,
        "name",
        "version",
        "dist.integrity",
        "dist.shasum",
        "mangabaclaw",
        "--json",
      ]);
      expect(result.changed).toBe(false);
      expect(result.config).toBe(config);
      expect(result.outcomes).toEqual([
        {
          pluginId: "demo",
          status: "unchanged",
          currentVersion: "1.2.3",
          nextVersion: registryVersion,
          message:
            `demo is pinned to @acme/demo@1.2.3 (installed 1.2.3); ` +
            `registry ${updateChannel === "beta" ? "beta" : "latest"} resolves to ${registryVersion}. ` +
            `Pass \`mangabaclaw plugins update ${overrideSpec}\` to follow that registry line.`,
        },
      ]);
    },
  );

  it("reports a newer latest release when the beta line for an exact pin is unavailable", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "demo",
      packageName: "@acme/demo",
      installedVersion: "1.2.3",
      registryVersion: "1.2.3",
      registryIntegrity: "sha512-same",
      registryShasum: "same",
      spec: "@acme/demo@1.2.3",
      integrity: "sha512-same",
      shasum: "same",
    });
    runCommandWithTimeoutMock.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "npm error code E404",
    });
    mockNpmViewMetadata({
      name: "@acme/demo",
      version: "1.2.4",
    });
    installPluginFromNpmSpecMock.mockRejectedValue(new Error("installer should not run"));

    const result = await updatePlugin(config, "demo", { updateChannel: "beta" });

    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(runCommandWithTimeoutMock.mock.calls).toHaveLength(3);
    expect(runCommandWithTimeoutMock.mock.calls[2]?.[0]).toEqual([
      "npm",
      "view",
      "@acme/demo",
      "name",
      "version",
      "dist.integrity",
      "dist.shasum",
      "mangabaclaw",
      "--json",
    ]);
    expect(result.outcomes).toEqual([
      {
        pluginId: "demo",
        status: "unchanged",
        currentVersion: "1.2.3",
        nextVersion: "1.2.4",
        message:
          "demo is pinned to @acme/demo@1.2.3 (installed 1.2.3); registry latest resolves to 1.2.4. " +
          "Pass `mangabaclaw plugins update @acme/demo@latest` to follow that registry line.",
      },
    ]);
  });

  it.each([
    {
      name: "does not skip unchanged npm plugins when package metadata requires a newer plugin API",
      compatibility: { compat: { pluginApi: ">=2026.5.28-beta.4" } },
      assertFullOutcome: true,
    },
    {
      name: "does not skip unchanged npm plugins when package metadata requires a newer host",
      compatibility: { install: { minHostVersion: ">=2026.5.28-beta.4" } },
      assertFullOutcome: false,
    },
  ] as const)("$name", async ({ compatibility, assertFullOutcome }) => {
    vi.stubEnv("MANGABACLAW_COMPATIBILITY_HOST_VERSION", "2026.5.28-beta.3");
    const { config } = createNpmUpdateFixture({
      pluginId: "msteams",
      packageName: "@mangabaclaw/msteams",
      installedVersion: "2026.5.28-beta.4",
      registryVersion: "2026.5.28-beta.4",
      registryIntegrity: "sha512-newer",
      registryShasum: "newer",
      registryMangabaClaw: { extensions: ["./dist/index.js"], ...compatibility },
      integrity: "sha512-newer",
      shasum: "newer",
      installerVersion: "2026.5.28-beta.3",
      installerResolvedSpec: "@mangabaclaw/msteams@2026.5.28-beta.3",
    });

    const result = await updatePlugin(config, "msteams");

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/msteams");
    expect(npmInstallCall()?.mode).toBe("update");
    if (assertFullOutcome) {
      expect(npmInstallCall()?.expectedPluginId).toBe("msteams");
    }
    expect(result.changed).toBe(true);
    expectRecordFields(result.config.plugins?.installs?.msteams, {
      source: "npm",
      version: "2026.5.28-beta.3",
      resolvedName: "@mangabaclaw/msteams",
      resolvedVersion: "2026.5.28-beta.3",
      resolvedSpec: "@mangabaclaw/msteams@2026.5.28-beta.3",
    });
    if (assertFullOutcome) {
      expect(result.outcomes).toEqual([
        {
          pluginId: "msteams",
          status: "updated",
          currentVersion: "2026.5.28-beta.4",
          nextVersion: "2026.5.28-beta.3",
          message: "Updated msteams: 2026.5.28-beta.4 -> 2026.5.28-beta.3.",
        },
      ]);
    }
  });

  it("repairs missing mangabaclaw peer links before skipping unchanged npm plugins", async () => {
    const installPath = createInstalledPackageDir({
      name: "@mangabaclaw/codex",
      version: "2026.5.3",
      peerDependencies: { mangabaclaw: ">=2026.5.3" },
    });
    mockNpmViewMetadata({
      name: "@mangabaclaw/codex",
      version: "2026.5.3",
      integrity: "sha512-same",
      shasum: "same",
    });
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "codex",
        targetDir: installPath,
        version: "2026.5.3",
        npmResolution: {
          name: "@mangabaclaw/codex",
          version: "2026.5.3",
          resolvedSpec: "@mangabaclaw/codex@2026.5.3",
        },
      }),
    );
    const config: MangabaClawConfig = {
      plugins: {
        installs: {
          codex: {
            source: "npm",
            spec: "@mangabaclaw/codex",
            installPath,
            resolvedName: "@mangabaclaw/codex",
            resolvedVersion: "2026.5.3",
            resolvedSpec: "@mangabaclaw/codex@2026.5.3",
            integrity: "sha512-same",
            shasum: "same",
          },
        },
      },
    };

    const result = await updatePlugin(config, "codex");

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/codex");
    expect(npmInstallCall()?.mode).toBe("update");
    expect(npmInstallCall()?.expectedPluginId).toBe("codex");
    expect(result.changed).toBe(true);
    expect(result.outcomes).toEqual([
      {
        pluginId: "codex",
        status: "unchanged",
        currentVersion: "2026.5.3",
        nextVersion: "2026.5.3",
        message: "codex already at 2026.5.3.",
      },
    ]);
  });

  it("skips unchanged npm plugins when the mangabaclaw peer link already resolves", async () => {
    const installPath = createInstalledPackageDir({
      name: "@mangabaclaw/codex",
      version: "2026.5.3",
      peerDependencies: { mangabaclaw: ">=2026.5.3" },
    });
    fs.mkdirSync(path.join(installPath, "node_modules"), { recursive: true });
    fs.symlinkSync(
      fs.realpathSync(process.cwd()),
      path.join(installPath, "node_modules", "mangabaclaw"),
      "junction",
    );
    mockNpmViewMetadata({
      name: "@mangabaclaw/codex",
      version: "2026.5.3",
      integrity: "sha512-same",
      shasum: "same",
    });
    installPluginFromNpmSpecMock.mockRejectedValue(new Error("installer should not run"));

    const result = await updateNpmInstalledPlugins({
      config: {
        plugins: {
          installs: {
            codex: {
              source: "npm",
              spec: "@mangabaclaw/codex",
              installPath,
              resolvedName: "@mangabaclaw/codex",
              resolvedVersion: "2026.5.3",
              resolvedSpec: "@mangabaclaw/codex@2026.5.3",
              integrity: "sha512-same",
              shasum: "same",
            },
          },
        },
      },
      pluginIds: ["codex"],
    });

    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expect(result.outcomes).toEqual([
      {
        pluginId: "codex",
        status: "unchanged",
        currentVersion: "2026.5.3",
        nextVersion: "2026.5.3",
        message: "codex is up to date (2026.5.3).",
      },
    ]);
  });

  it.each(["peerDependencies", "dependencies"] as const)(
    "repairs every copied stale %s host for unchanged npm plugins without reinstalling them",
    async (dependencyField) => {
      const stateDir = makeTrackedTempDir("mangabaclaw-plugin-update-legacy", tempDirs);
      const plugins = ["email", "calendar"].map((pluginId) => {
        const packageName = `@clawemail/${pluginId}`;
        const installPath = path.join(stateDir, "extensions", pluginId);
        const staleHostDir = path.join(installPath, "node_modules", "mangabaclaw");
        fs.mkdirSync(staleHostDir, { recursive: true });
        fs.writeFileSync(
          path.join(installPath, "package.json"),
          JSON.stringify({
            name: packageName,
            version: "2026.7.1",
            [dependencyField]: { mangabaclaw: ">=2026.7.1" },
          }),
        );
        fs.writeFileSync(
          path.join(staleHostDir, "package.json"),
          JSON.stringify({ name: "mangabaclaw", version: "2026.7.1-beta.2" }),
        );
        mockNpmViewMetadata({
          name: packageName,
          version: "2026.7.1",
          integrity: "sha512-same",
          shasum: "same",
        });
        return { pluginId, packageName, installPath, staleHostDir };
      });
      installPluginFromNpmSpecMock.mockRejectedValue(new Error("installer should not run"));

      const result = await withEnvAsync({ MANGABACLAW_STATE_DIR: stateDir }, async () =>
        updateNpmInstalledPlugins({
          config: {
            plugins: {
              installs: Object.fromEntries(
                plugins.map(({ pluginId, packageName, installPath }) => [
                  pluginId,
                  {
                    source: "npm" as const,
                    spec: packageName,
                    installPath,
                    resolvedName: packageName,
                    resolvedVersion: "2026.7.1",
                    resolvedSpec: `${packageName}@2026.7.1`,
                    integrity: "sha512-same",
                    shasum: "same",
                  },
                ]),
              ),
            },
          },
          pluginIds: plugins.map(({ pluginId }) => pluginId),
        }),
      );

      expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
      for (const { staleHostDir } of plugins) {
        expect(fs.lstatSync(staleHostDir).isSymbolicLink()).toBe(true);
        expect(fs.realpathSync(staleHostDir)).toBe(fs.realpathSync(process.cwd()));
      }
      expect(result.changed).toBe(true);
      expect(result.outcomes.map(({ pluginId, status }) => ({ pluginId, status }))).toEqual(
        plugins.map(({ pluginId }) => ({ pluginId, status: "unchanged" })),
      );
    },
  );

  it("repairs mangabaclaw peer links after batch npm updates prune earlier plugin links", async () => {
    const plugins = [
      { pluginId: "brave", packageName: "@mangabaclaw/brave-plugin" },
      { pluginId: "codex", packageName: "@mangabaclaw/codex" },
      { pluginId: "discord", packageName: "@mangabaclaw/discord" },
    ];
    const { stateDir, installPaths, peerLinkPath, linkPeer } =
      createMangabaClawPeerLinkFixtures(plugins);
    for (const { packageName } of plugins) {
      mockNpmViewMetadata({
        name: packageName,
        version: "2026.5.5",
        integrity: "sha512-same",
        shasum: "same",
      });
    }
    installPluginFromNpmSpecMock.mockImplementation(
      (params: { expectedPluginId?: string; spec: string }) => {
        const pluginId = requireExpectedPluginId(params);
        for (const { pluginId: installedPluginId } of plugins) {
          fs.rmSync(peerLinkPath(installedPluginId), { recursive: true, force: true });
        }
        linkPeer(pluginId);
        const packageName = requirePluginPackageName(plugins, pluginId);
        return Promise.resolve(
          createSuccessfulNpmUpdateResult({
            pluginId,
            targetDir: installPaths[pluginId],
            version: "2026.5.5",
            npmResolution: {
              name: packageName,
              version: "2026.5.5",
              resolvedSpec: `${packageName}@2026.5.5`,
            },
          }),
        );
      },
    );

    const result = await withEnvAsync({ MANGABACLAW_STATE_DIR: stateDir }, async () =>
      updateNpmInstalledPlugins({
        config: createPeerLinkInstallConfig({ plugins, installPaths }),
        pluginIds: plugins.map((plugin) => plugin.pluginId),
      }),
    );

    expect(installPluginFromNpmSpecMock).toHaveBeenCalledTimes(3);
    for (const { pluginId } of plugins) {
      expect(fs.existsSync(peerLinkPath(pluginId))).toBe(true);
    }
    expect(result.outcomes).toEqual(
      plugins.map(({ pluginId }) => ({
        pluginId,
        status: "updated",
        currentVersion: "2026.5.4",
        nextVersion: "2026.5.5",
        message: `Updated ${pluginId}: 2026.5.4 -> 2026.5.5.`,
      })),
    );
  });

  it("repairs sibling mangabaclaw peer links after a targeted npm update prunes the shared install tree", async () => {
    const plugins = [
      { pluginId: "brave", packageName: "@mangabaclaw/brave-plugin" },
      { pluginId: "codex", packageName: "@mangabaclaw/codex" },
      { pluginId: "discord", packageName: "@mangabaclaw/discord" },
    ];
    const { stateDir, installPaths, peerLinkPath, linkPeer } =
      createMangabaClawPeerLinkFixtures(plugins);
    linkPeer("brave");
    linkPeer("discord");
    mockNpmViewMetadata({
      name: "@mangabaclaw/codex",
      version: "2026.5.5",
      integrity: "sha512-same",
      shasum: "same",
    });
    installPluginFromNpmSpecMock.mockImplementation(() => {
      for (const { pluginId } of plugins) {
        fs.rmSync(peerLinkPath(pluginId), { recursive: true, force: true });
      }
      linkPeer("codex");
      return Promise.resolve(
        createSuccessfulNpmUpdateResult({
          pluginId: "codex",
          targetDir: installPaths.codex,
          version: "2026.5.5",
          npmResolution: {
            name: "@mangabaclaw/codex",
            version: "2026.5.5",
            resolvedSpec: "@mangabaclaw/codex@2026.5.5",
          },
        }),
      );
    });

    await withEnvAsync({ MANGABACLAW_STATE_DIR: stateDir }, async () =>
      updateNpmInstalledPlugins({
        config: createPeerLinkInstallConfig({ plugins, installPaths }),
        pluginIds: ["codex"],
      }),
    );

    expect(installPluginFromNpmSpecMock).toHaveBeenCalledTimes(1);
    for (const { pluginId } of plugins) {
      expect(fs.existsSync(peerLinkPath(pluginId))).toBe(true);
    }
  });

  it.runIf(process.platform !== "win32")(
    "never repairs external, developer-owned, or aliased host packages after an npm update",
    async () => {
      const plugins = [
        { pluginId: "sibling", packageName: "@acme/sibling" },
        { pluginId: "updated", packageName: "@acme/updated" },
      ];
      const { stateDir, installPaths, peerLinkPath, linkPeer } =
        createMangabaClawPeerLinkFixtures(plugins);
      linkPeer("sibling");

      const outsideInstallPath = createInstalledPackageDir({
        name: "@acme/outside",
        version: "2026.5.4",
        peerDependencies: { mangabaclaw: ">=2026.5.4" },
      });
      const developerInstallPath = createInstalledPackageDir({
        name: "@acme/developer",
        version: "2026.5.4",
        peerDependencies: { mangabaclaw: ">=2026.5.4" },
        installPath: path.join(stateDir, "extensions", "developer"),
      });
      const marketplaceInstallPath = createInstalledPackageDir({
        name: "@acme/marketplace",
        version: "2026.5.4",
        peerDependencies: { mangabaclaw: ">=2026.5.4" },
        installPath: path.join(stateDir, "extensions", "marketplace"),
      });
      const clawhubInstallPath = createInstalledPackageDir({
        name: "@acme/clawhub",
        version: "2026.5.4",
        peerDependencies: { mangabaclaw: ">=2026.5.4" },
        installPath: path.join(stateDir, "extensions", "clawhub"),
      });
      const copiedHosts = [
        outsideInstallPath,
        developerInstallPath,
        marketplaceInstallPath,
        clawhubInstallPath,
      ].map((installPath) => {
        const copiedHostDir = path.join(installPath, "node_modules", "mangabaclaw");
        fs.mkdirSync(copiedHostDir, { recursive: true });
        fs.writeFileSync(
          path.join(copiedHostDir, "package.json"),
          JSON.stringify({ name: "mangabaclaw", version: "2026.4.1" }),
        );
        return copiedHostDir;
      });
      const outsideAliasPath = path.join(stateDir, "extensions", "outside-alias");
      const developerAliasPath = path.join(stateDir, "extensions", "developer-alias");
      fs.symlinkSync(outsideInstallPath, outsideAliasPath, "dir");
      fs.symlinkSync(developerInstallPath, developerAliasPath, "dir");

      mockNpmViewMetadata({
        name: "@acme/updated",
        version: "2026.5.5",
        integrity: "sha512-same",
        shasum: "same",
      });
      installPluginFromNpmSpecMock.mockImplementation(() => {
        fs.rmSync(peerLinkPath("sibling"), { recursive: true, force: true });
        fs.rmSync(peerLinkPath("updated"), { recursive: true, force: true });
        linkPeer("updated");
        return Promise.resolve(
          createSuccessfulNpmUpdateResult({
            pluginId: "updated",
            targetDir: installPaths.updated,
            version: "2026.5.5",
            npmResolution: {
              name: "@acme/updated",
              version: "2026.5.5",
              resolvedSpec: "@acme/updated@2026.5.5",
            },
          }),
        );
      });

      await withEnvAsync({ MANGABACLAW_STATE_DIR: stateDir }, async () =>
        updateNpmInstalledPlugins({
          config: createPeerLinkInstallConfig({
            plugins,
            installPaths,
            extraInstalls: {
              outside: { source: "npm", installPath: outsideInstallPath },
              "outside-alias": { source: "npm", installPath: outsideAliasPath },
              developer: { source: "path", installPath: developerInstallPath },
              "developer-alias": { source: "npm", installPath: developerAliasPath },
              marketplace: { source: "marketplace", installPath: marketplaceInstallPath },
              clawhub: { source: "clawhub", installPath: clawhubInstallPath },
            },
          }),
          pluginIds: ["updated"],
        }),
      );

      expect(installPluginFromNpmSpecMock).toHaveBeenCalledTimes(1);
      expect(fs.lstatSync(peerLinkPath("sibling")).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(peerLinkPath("updated")).isSymbolicLink()).toBe(true);
      for (const copiedHostDir of copiedHosts) {
        expect(fs.lstatSync(copiedHostDir).isDirectory()).toBe(true);
        expect(
          JSON.parse(fs.readFileSync(path.join(copiedHostDir, "package.json"), "utf8")),
        ).toEqual({ name: "mangabaclaw", version: "2026.4.1" });
      }
    },
  );

  it("continues repairing sibling mangabaclaw peer links after one recorded npm install cannot be relinked", async () => {
    const plugins = [
      { pluginId: "brave", packageName: "@mangabaclaw/brave-plugin" },
      { pluginId: "codex", packageName: "@mangabaclaw/codex" },
    ];
    const { stateDir, installPaths, peerLinkPath, linkPeer } =
      createMangabaClawPeerLinkFixtures(plugins);
    const malformedInstallPath = path.join(stateDir, "extensions", "aardvark");
    fs.mkdirSync(malformedInstallPath, { recursive: true });
    fs.writeFileSync(path.join(malformedInstallPath, "package.json"), "{ malformed");
    const brokenInstallPath = createInstalledPackageDir({
      name: "@mangabaclaw/broken-plugin",
      version: "2026.5.4",
      peerDependencies: { mangabaclaw: ">=2026.5.4" },
      installPath: path.join(stateDir, "extensions", "broken"),
    });
    fs.writeFileSync(path.join(brokenInstallPath, "node_modules"), "not a directory");
    linkPeer("brave");
    mockNpmViewMetadata({
      name: "@mangabaclaw/codex",
      version: "2026.5.5",
      integrity: "sha512-same",
      shasum: "same",
    });
    installPluginFromNpmSpecMock.mockImplementation(() => {
      for (const { pluginId } of plugins) {
        fs.rmSync(peerLinkPath(pluginId), { recursive: true, force: true });
      }
      linkPeer("codex");
      return Promise.resolve(
        createSuccessfulNpmUpdateResult({
          pluginId: "codex",
          targetDir: installPaths.codex,
          version: "2026.5.5",
          npmResolution: {
            name: "@mangabaclaw/codex",
            version: "2026.5.5",
            resolvedSpec: "@mangabaclaw/codex@2026.5.5",
          },
        }),
      );
    });
    const warnMessages: string[] = [];

    await withEnvAsync({ MANGABACLAW_STATE_DIR: stateDir }, async () =>
      updateNpmInstalledPlugins({
        config: createPeerLinkInstallConfig({
          plugins,
          installPaths,
          extraInstalls: {
            aardvark: { source: "npm", installPath: malformedInstallPath },
            broken: {
              source: "npm",
              spec: "@mangabaclaw/broken-plugin",
              installPath: brokenInstallPath,
              resolvedName: "@mangabaclaw/broken-plugin",
              resolvedVersion: "2026.5.4",
              resolvedSpec: "@mangabaclaw/broken-plugin@2026.5.4",
            },
          },
        }),
        pluginIds: ["codex"],
        logger: { warn: (message) => warnMessages.push(message) },
      }),
    );

    expect(installPluginFromNpmSpecMock).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(peerLinkPath("brave"))).toBe(true);
    expect(fs.existsSync(peerLinkPath("codex"))).toBe(true);
    expect(warnMessages).toEqual([
      expect.stringContaining(
        `Could not repair mangabaclaw peer link at ${malformedInstallPath}: SyntaxError:`,
      ),
      `Skipping mangabaclaw peerDependency link because ${path.join(brokenInstallPath, "node_modules")} is not a real directory.`,
    ]);
  });

  it("refreshes legacy npm install records before skipping unchanged artifacts", async () => {
    const installPath = createInstalledPackageDir({
      name: "@martian-engineering/lossless-claw",
      version: "0.9.0",
    });
    mockNpmViewMetadata({
      name: "@martian-engineering/lossless-claw",
      version: "0.9.0",
      integrity: "sha512-same",
      shasum: "same",
    });
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "lossless-claw",
        targetDir: installPath,
        version: "0.9.0",
        npmResolution: {
          name: "@martian-engineering/lossless-claw",
          version: "0.9.0",
          resolvedSpec: "@martian-engineering/lossless-claw@0.9.0",
        },
      }),
    );

    const result = await updateNpmInstalledPlugins({
      config: createNpmInstallConfig({
        pluginId: "lossless-claw",
        spec: "@martian-engineering/lossless-claw",
        installPath,
      }),
      pluginIds: ["lossless-claw"],
    });

    expect(installPluginFromNpmSpecMock).toHaveBeenCalledTimes(1);
    expect(result.changed).toBe(true);
    expectRecordFields(result.outcomes[0], {
      pluginId: "lossless-claw",
      status: "unchanged",
      currentVersion: "0.9.0",
      nextVersion: "0.9.0",
    });
    expectRecordFields(result.config.plugins?.installs?.["lossless-claw"], {
      source: "npm",
      spec: "@martian-engineering/lossless-claw",
      resolvedName: "@martian-engineering/lossless-claw",
      resolvedVersion: "0.9.0",
      resolvedSpec: "@martian-engineering/lossless-claw@0.9.0",
    });
  });

  it("expands home-relative install paths before checking installed npm versions", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-plugin-update-home-"));
    tempDirs.push(home);
    const installPath = path.join(home, ".mangabaclaw", "extensions", "lossless-claw");
    fs.mkdirSync(installPath, { recursive: true });
    fs.writeFileSync(
      path.join(installPath, "package.json"),
      JSON.stringify({ name: "@martian-engineering/lossless-claw", version: "0.9.0" }),
    );
    mockNpmViewMetadata({
      name: "@martian-engineering/lossless-claw",
      version: "0.9.0",
      integrity: "sha512-same",
      shasum: "same",
    });
    installPluginFromNpmSpecMock.mockRejectedValue(new Error("installer should not run"));

    const result = await withEnvAsync({ HOME: home }, () =>
      updateNpmInstalledPlugins({
        config: createNpmInstallConfig({
          pluginId: "lossless-claw",
          spec: "@martian-engineering/lossless-claw",
          installPath: "~/.mangabaclaw/extensions/lossless-claw",
          resolvedName: "@martian-engineering/lossless-claw",
          resolvedVersion: "0.9.0",
          resolvedSpec: "@martian-engineering/lossless-claw@0.9.0",
          integrity: "sha512-same",
          shasum: "same",
        }),
        pluginIds: ["lossless-claw"],
      }),
    );

    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expect(result.outcomes).toHaveLength(1);
    expectRecordFields(result.outcomes[0], {
      pluginId: "lossless-claw",
      status: "unchanged",
      currentVersion: "0.9.0",
    });
  });

  it("falls through to npm reinstall when the recorded integrity differs", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "lossless-claw",
      packageName: "@martian-engineering/lossless-claw",
      installedVersion: "0.9.0",
      registryVersion: "0.9.0",
      registryIntegrity: "sha512-new",
      integrity: "sha512-old",
      installerVersion: "0.9.0",
      installerResolvedSpec: "@martian-engineering/lossless-claw@0.9.0",
    });
    const result = await updatePlugin(config, "lossless-claw");

    expect(installPluginFromNpmSpecMock).toHaveBeenCalledTimes(1);
    expect(result.changed).toBe(true);
    expectRecordFields(result.outcomes[0], {
      pluginId: "lossless-claw",
      status: "unchanged",
      currentVersion: "0.9.0",
      nextVersion: "0.9.0",
    });
  });

  it.each([
    {
      name: "falls through to npm reinstall when metadata probing fails for valid specs",
      spec: "@martian-engineering/lossless-claw",
      fallsBack: true,
    },
    {
      name: "records range metadata probing failures without falling through to npm reinstall",
      spec: "@martian-engineering/lossless-claw@^0.9.0",
      fallsBack: false,
    },
  ] as const)("$name", async ({ spec, fallsBack }) => {
    const warn = vi.fn();
    const installPath = createInstalledPackageDir({
      name: "@martian-engineering/lossless-claw",
      version: "0.9.0",
    });
    runCommandWithTimeoutMock.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "registry timeout",
    });
    if (fallsBack) {
      installPluginFromNpmSpecMock.mockResolvedValue(
        createSuccessfulNpmUpdateResult({
          pluginId: "lossless-claw",
          targetDir: installPath,
          version: "0.9.0",
        }),
      );
    }
    const result = await updatePlugin(
      createNpmInstallConfig({
        pluginId: "lossless-claw",
        spec,
        installPath,
      }),
      "lossless-claw",
      { logger: { warn } },
    );

    if (fallsBack) {
      expect(warn).toHaveBeenCalledWith(
        "Could not check lossless-claw before update; falling back to installer path: npm view failed: registry timeout",
      );
      expect(installPluginFromNpmSpecMock).toHaveBeenCalledTimes(1);
    } else {
      expect(warn).not.toHaveBeenCalled();
      expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
      expect(result.changed).toBe(false);
      expect(result.outcomes).toEqual([
        {
          pluginId: "lossless-claw",
          status: "error",
          message: "Failed to check lossless-claw: npm view failed: registry timeout",
        },
      ]);
    }
  });

  it("defers installed payload validation until metadata probing fails", async () => {
    const installPath = createInstalledPackageDir({
      name: "@martian-engineering/lossless-claw",
      version: "0.9.0",
      runnable: true,
    });
    mockNpmViewMetadata({
      name: "@martian-engineering/lossless-claw",
      version: "0.9.0",
    });

    const result = await updateNpmInstalledPlugins({
      config: createNpmInstallConfig({
        pluginId: "lossless-claw",
        spec: "@martian-engineering/lossless-claw@^0.9.0",
        installPath,
        resolvedName: "@martian-engineering/lossless-claw",
        resolvedSpec: "@martian-engineering/lossless-claw@0.9.0",
        resolvedVersion: "0.9.0",
      }),
      pluginIds: ["lossless-claw"],
      disableOnFailure: true,
    });

    expect(result.outcomes[0]?.status).toBe("unchanged");
    expect(validatePackageExtensionEntriesForInstallMock).not.toHaveBeenCalled();
  });

  it("preserves healthy plugin state when metadata probing fails before replacement", async () => {
    const warn = vi.fn();
    const installPath = createInstalledPackageDir({
      name: "@martian-engineering/lossless-claw",
      version: "0.9.0",
      runnable: true,
    });
    runCommandWithTimeoutMock.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "registry timeout",
    });

    const result = await updateNpmInstalledPlugins({
      config: {
        plugins: {
          allow: ["lossless-claw", "keep"],
          deny: ["lossless-claw", "blocked"],
          slots: {
            memory: "lossless-claw",
            contextEngine: "lossless-claw",
          },
          entries: {
            "lossless-claw": {
              enabled: true,
              config: { preserved: true },
            },
          },
          installs: {
            "lossless-claw": {
              source: "npm",
              spec: "@martian-engineering/lossless-claw@^0.9.0",
              installPath,
              resolvedName: "@martian-engineering/lossless-claw",
              resolvedVersion: "0.9.0",
              resolvedSpec: "@martian-engineering/lossless-claw@0.9.0",
            },
          },
        },
      },
      pluginIds: ["lossless-claw"],
      disableOnFailure: true,
      logger: { warn },
    });

    expect(warn).not.toHaveBeenCalled();
    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expect(result.config.plugins?.entries?.["lossless-claw"]).toEqual({
      enabled: true,
      config: { preserved: true },
    });
    expect(result.config.plugins?.allow).toEqual(["lossless-claw", "keep"]);
    expect(result.config.plugins?.deny).toEqual(["lossless-claw", "blocked"]);
    expect(result.config.plugins?.slots).toEqual({
      memory: "lossless-claw",
      contextEngine: "lossless-claw",
    });
    expect(validatePackageExtensionEntriesForInstallMock).toHaveBeenCalledTimes(1);
    expect(result.outcomes).toEqual([
      {
        pluginId: "lossless-claw",
        status: "error",
        message: "Failed to check lossless-claw: npm view failed: registry timeout",
      },
    ]);
  });

  it("disables a corrupt installed payload when metadata probing also fails", async () => {
    const warn = vi.fn();
    const installPath = createInstalledPackageDir({
      name: "@martian-engineering/lossless-claw",
      version: "0.9.0",
      runnable: true,
    });
    fs.rmSync(path.join(installPath, "index.js"));
    runCommandWithTimeoutMock.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "registry timeout",
    });

    const result = await updateNpmInstalledPlugins({
      config: {
        plugins: {
          allow: ["lossless-claw", "keep"],
          deny: ["lossless-claw", "blocked"],
          slots: {
            memory: "lossless-claw",
            contextEngine: "lossless-claw",
          },
          entries: {
            "lossless-claw": {
              enabled: true,
              config: { preserved: true },
            },
          },
          installs: {
            "lossless-claw": {
              source: "npm",
              spec: "@martian-engineering/lossless-claw@^0.9.0",
              installPath,
            },
          },
        },
      },
      pluginIds: ["lossless-claw"],
      disableOnFailure: true,
      logger: { warn },
    });

    const message =
      'Disabled "lossless-claw" after plugin update failure; MangabaClaw will continue without it. Failed to check lossless-claw: npm view failed: registry timeout';
    expect(warn).toHaveBeenCalledWith(message);
    expect(result.changed).toBe(true);
    expect(result.config.plugins?.entries?.["lossless-claw"]).toEqual({
      enabled: false,
      config: { preserved: true },
    });
    expect(result.config.plugins?.allow).toEqual(["lossless-claw", "keep"]);
    expect(result.config.plugins?.deny).toEqual(["lossless-claw", "blocked"]);
    expect(result.config.plugins?.slots).toBeUndefined();
    expect(result.outcomes).toEqual([
      {
        pluginId: "lossless-claw",
        status: "skipped",
        message,
      },
    ]);
  });

  it("continues the plugin sweep when deferred payload validation throws", async () => {
    const warn = vi.fn();
    const installPath = createInstalledPackageDir({
      name: "@acme/demo",
      version: "1.0.0",
      runnable: true,
    });
    runCommandWithTimeoutMock.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "registry timeout",
    });
    validatePackageExtensionEntriesForInstallMock.mockImplementationOnce(() => {
      throw new Error("permission denied");
    });

    const result = await updateNpmInstalledPlugins({
      config: {
        plugins: {
          entries: { demo: { enabled: true } },
          installs: {
            demo: {
              source: "npm",
              spec: "@acme/demo@^1.0.0",
              installPath,
            },
            local: {
              source: "path",
              installPath: "/tmp/local",
            },
          },
        },
      },
      pluginIds: ["demo", "local"],
      disableOnFailure: true,
      logger: { warn },
    });

    expect(result.config.plugins?.entries?.demo?.enabled).toBe(false);
    expect(result.outcomes.map(({ pluginId }) => pluginId)).toEqual(["demo", "local"]);
  });

  it("disables a missing plugin payload when metadata probing also fails", async () => {
    const warn = vi.fn();
    const installPath = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-plugin-update-missing-"));
    tempDirs.push(installPath);
    installPluginFromNpmSpecMock.mockResolvedValue({
      ok: false,
      error: "npm view failed: registry timeout",
      code: "npm_metadata_failure",
    });
    const config = {
      plugins: {
        allow: ["demo", "other"],
        deny: ["demo", "blocked"],
        slots: { memory: "demo" },
        entries: {
          demo: {
            enabled: true,
            config: { preserved: true },
          },
        },
        installs: {
          demo: {
            source: "npm" as const,
            spec: "@acme/demo",
            installPath,
          },
        },
      },
    } satisfies MangabaClawConfig;

    const result = await updatePlugin(config, "demo", {
      disableOnFailure: true,
      logger: { warn },
    });

    const message =
      'Disabled "demo" after plugin update failure; MangabaClaw will continue without it. Failed to update demo: npm view failed: registry timeout';
    expect(warn).toHaveBeenCalledWith(message);
    expect(result.changed).toBe(true);
    expect(result.config.plugins?.entries?.demo).toEqual({
      enabled: false,
      config: { preserved: true },
    });
    expect(result.config.plugins?.allow).toEqual(["demo", "other"]);
    expect(result.config.plugins?.deny).toEqual(["demo", "blocked"]);
    expect(result.config.plugins?.slots?.memory).toBeUndefined();
    expect(result.outcomes).toEqual([
      {
        pluginId: "demo",
        status: "skipped",
        message,
      },
    ]);
  });

  it.each([
    {
      source: "npm",
      config: createDisabledPluginConfig({
        source: "npm",
        spec: "@acme/demo",
        installPath: "/tmp/demo",
        resolvedName: "@acme/demo",
      }),
    },
    {
      source: "ClawHub",
      config: createDisabledPluginConfig({
        source: "clawhub",
        spec: "clawhub:demo",
        installPath: "/tmp/demo",
        clawhubUrl: "https://clawhub.ai",
        clawhubPackage: "demo",
        clawhubFamily: "code-plugin",
        clawhubChannel: "official",
      }),
    },
    {
      source: "marketplace",
      config: createDisabledPluginConfig({
        source: "marketplace",
        installPath: "/tmp/demo",
        marketplaceSource: "acme/plugins",
        marketplacePlugin: "demo",
      }),
    },
  ])("skips disabled $source installs before update network calls", async ({ config }) => {
    installPluginFromNpmSpecMock.mockRejectedValue(new Error("npm installer should not run"));
    installPluginFromClawHubMock.mockRejectedValue(new Error("ClawHub installer should not run"));
    installPluginFromMarketplaceMock.mockRejectedValue(
      new Error("marketplace installer should not run"),
    );

    const result = await updateNpmInstalledPlugins({
      config,
      skipDisabledPlugins: true,
    });

    expect(runCommandWithTimeoutMock).not.toHaveBeenCalled();
    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(installPluginFromClawHubMock).not.toHaveBeenCalled();
    expect(installPluginFromMarketplaceMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expect(result.config).toBe(config);
    expect(result.config.plugins?.installs?.demo).toEqual(config.plugins?.installs?.demo);
    expect(result.config.plugins?.entries?.demo).toEqual({
      enabled: false,
      config: { preserved: true },
    });
    expect(result.outcomes).toEqual([
      {
        pluginId: "demo",
        status: "skipped",
        message: 'Skipping "demo" (disabled in config).',
      },
    ]);
  });

  it("updates disabled trusted official npm installs from the channel spec when requested", async () => {
    const installPath = createInstalledPackageDir({
      name: "@mangabaclaw/codex",
      version: "2026.5.3",
    });
    mockNpmViewMetadata({
      name: "@mangabaclaw/codex",
      version: "2026.5.4",
      integrity: "sha512-next",
      shasum: "next",
    });
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "codex",
        targetDir: installPath,
        version: "2026.5.4",
        npmResolution: {
          name: "@mangabaclaw/codex",
          version: "2026.5.4",
          resolvedSpec: "@mangabaclaw/codex@2026.5.4",
        },
      }),
    );

    const result = await updateNpmInstalledPlugins({
      config: {
        plugins: {
          entries: {
            codex: {
              enabled: false,
              config: { preserved: true },
            },
          },
          installs: {
            codex: {
              source: "npm",
              spec: "@mangabaclaw/codex@2026.5.3",
              installPath,
            },
          },
        },
      },
      skipDisabledPlugins: true,
      syncOfficialPluginInstalls: true,
    });

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/codex");
    expect(npmInstallCall()?.expectedPluginId).toBe("codex");
    expect(npmInstallCall()?.trustedSourceLinkedOfficialInstall).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.config.plugins?.entries?.codex).toEqual({
      enabled: false,
      config: { preserved: true },
    });
    expectRecordFields(result.config.plugins?.installs?.codex, {
      source: "npm",
      spec: "@mangabaclaw/codex@2026.5.4",
      version: "2026.5.4",
      resolvedName: "@mangabaclaw/codex",
      resolvedVersion: "2026.5.4",
      resolvedSpec: "@mangabaclaw/codex@2026.5.4",
    });
    expectRecordFields(result.outcomes[0], {
      pluginId: "codex",
      status: "updated",
      currentVersion: "2026.5.3",
      nextVersion: "2026.5.4",
    });
  });

  it("preserves exact official npm pins on an inferred beta channel", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "codex",
      packageName: "@mangabaclaw/codex",
      installedVersion: "2026.5.28",
      spec: "@mangabaclaw/codex@2026.5.28",
      installerVersion: "2026.5.28",
      installerResolvedSpec: "@mangabaclaw/codex@2026.5.28",
    });
    const result = await updatePlugin(config, "codex", {
      dryRun: true,
      officialPluginUpdateChannel: "beta",
    });

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/codex@2026.5.28");
    expect(npmInstallCall()?.expectedPluginId).toBe("codex");
    expect(npmInstallCall()?.trustedSourceLinkedOfficialInstall).toBe(true);
    expect(result.changed).toBe(false);
    expectRecordFields(result.outcomes[0], {
      pluginId: "codex",
      status: "unchanged",
      currentVersion: "2026.5.28",
      nextVersion: "2026.5.28",
    });
  });

  it("reinstalls missing exact official npm pins without official install sync", async () => {
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-missing-plugin-"));
    tempDirs.push(extensionsDir);
    const installPath = path.join(extensionsDir, "codex");
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "codex",
        targetDir: installPath,
        version: "2026.5.28",
        npmResolution: {
          name: "@mangabaclaw/codex",
          version: "2026.5.28",
          resolvedSpec: "@mangabaclaw/codex@2026.5.28",
        },
      }),
    );

    const result = await updateNpmInstalledPlugins({
      config: createNpmInstallConfig({
        pluginId: "codex",
        spec: "@mangabaclaw/codex@2026.5.28",
        installPath,
        resolvedName: "@mangabaclaw/codex",
        resolvedSpec: "@mangabaclaw/codex@2026.5.28",
        resolvedVersion: "2026.5.28",
      }),
      pluginIds: ["codex"],
    });

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/codex@2026.5.28");
    expect(npmInstallCall()?.extensionsDir).toBe(extensionsDir);
    expect(runCommandWithTimeoutMock).not.toHaveBeenCalled();
    expectRecordFields(result.config.plugins?.installs?.codex, {
      source: "npm",
      spec: "@mangabaclaw/codex@2026.5.28",
      installPath,
      version: "2026.5.28",
      resolvedName: "@mangabaclaw/codex",
      resolvedSpec: "@mangabaclaw/codex@2026.5.28",
      resolvedVersion: "2026.5.28",
    });
    expectRecordFields(result.outcomes[0], {
      pluginId: "codex",
      status: "updated",
      nextVersion: "2026.5.28",
    });
  });

  it("keeps integrity checks when official sync repairs missing exact npm pins", async () => {
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-missing-plugin-"));
    tempDirs.push(extensionsDir);
    const installPath = path.join(extensionsDir, "codex");
    mockNpmViewMetadata({
      name: "@mangabaclaw/codex",
      version: "2026.5.28",
      integrity: "sha512-old",
    });
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "codex",
        targetDir: installPath,
        version: "2026.5.28",
        npmResolution: {
          name: "@mangabaclaw/codex",
          version: "2026.5.28",
          resolvedSpec: "@mangabaclaw/codex@2026.5.28",
        },
      }),
    );

    await updateNpmInstalledPlugins({
      config: createNpmInstallConfig({
        pluginId: "codex",
        spec: "@mangabaclaw/codex@2026.5.28",
        installPath,
        resolvedName: "@mangabaclaw/codex",
        resolvedSpec: "@mangabaclaw/codex@2026.5.28",
        resolvedVersion: "2026.5.28",
        integrity: "sha512-old",
      }),
      pluginIds: ["codex"],
      syncOfficialPluginInstalls: true,
    });

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/codex");
    expect(npmInstallCall()?.expectedIntegrity).toBe("sha512-old");
  });

  it("keeps third-party exact pinned npm specs pinned during official install sync", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "demo",
      packageName: "@acme/demo",
      installedVersion: "1.2.3",
      spec: "@acme/demo@1.2.3",
      installerVersion: "1.2.3",
    });
    await updatePlugin(config, "demo", {
      dryRun: true,
      syncOfficialPluginInstalls: true,
    });

    expect(npmInstallCall()?.spec).toBe("@acme/demo@1.2.3");
    expect(npmInstallCall()?.expectedPluginId).toBe("demo");
  });

  it.each([
    {
      name: "uses exact npm spec selectors as dry-run target versions when probes omit metadata",
      targetVersion: "1.2.4",
      status: "updated",
      message: "Would update demo: 1.2.3 -> 1.2.4.",
    },
    {
      name: "keeps exact npm dry-runs unchanged when probe metadata is absent but spec matches",
      targetVersion: "1.2.3",
      status: "unchanged",
      message: "demo is up to date (1.2.3).",
    },
  ] as const)("$name", async ({ targetVersion, status, message }) => {
    const installPath = createInstalledPackageDir({
      name: "@acme/demo",
      version: "1.2.3",
    });
    installPluginFromNpmSpecMock.mockResolvedValue({
      ok: true,
      pluginId: "demo",
      targetDir: installPath,
      extensions: ["index.ts"],
    });

    const result = await updatePlugin(
      createNpmInstallConfig({
        pluginId: "demo",
        spec: `@acme/demo@${targetVersion}`,
        installPath,
      }),
      "demo",
      { dryRun: true },
    );

    expectRecordFields(result.outcomes[0], {
      pluginId: "demo",
      status,
      currentVersion: "1.2.3",
      nextVersion: targetVersion,
      message,
    });
  });

  it.each(["@acme/demo@1.2.3", "@acme/demo@v1.2.3"])(
    "reports newer registry default releases for exact pinned npm dry-runs from %s",
    async (spec) => {
      const { config } = createNpmUpdateFixture({
        pluginId: "demo",
        packageName: "@acme/demo",
        installedVersion: "1.2.3",
        registryVersion: "1.2.4",
        spec,
        installerVersion: "1.2.3",
        installerResolvedSpec: spec,
      });
      const result = await updatePlugin(config, "demo", { dryRun: true });

      expect(npmInstallCall()?.spec).toBe(spec);
      expect(npmViewCall()?.[0]).toEqual([
        "npm",
        "view",
        "@acme/demo",
        "name",
        "version",
        "dist.integrity",
        "dist.shasum",
        "mangabaclaw",
        "--json",
      ]);
      expectRecordFields(result.outcomes[0], {
        pluginId: "demo",
        status: "unchanged",
        currentVersion: "1.2.3",
        nextVersion: "1.2.4",
        message: `demo is pinned to ${spec} (installed 1.2.3); registry latest resolves to 1.2.4. Pass \`mangabaclaw plugins update @acme/demo@latest\` to follow that registry line.`,
      });
    },
  );

  it("updates disabled trusted official ClawHub installs through the catalog spec", async () => {
    installPluginFromClawHubMock.mockResolvedValue(
      createSuccessfulClawHubUpdateResult({
        pluginId: "diagnostics-otel",
        targetDir: "/tmp/diagnostics-otel",
        version: "2026.5.4",
        clawhubPackage: "@mangabaclaw/diagnostics-otel",
      }),
    );

    const config = createClawHubInstallConfig({
      pluginId: "diagnostics-otel",
      clawhubPackage: "@mangabaclaw/diagnostics-otel",
      spec: "clawhub:@mangabaclaw/diagnostics-otel@2026.5.3",
    });
    const result = await updateNpmInstalledPlugins({
      config: {
        ...config,
        plugins: {
          ...config.plugins,
          entries: {
            "diagnostics-otel": {
              enabled: false,
              config: { preserved: true },
            },
          },
        },
      },
      skipDisabledPlugins: true,
      syncOfficialPluginInstalls: true,
    });

    expect(clawHubInstallCall()?.spec).toBe("clawhub:@mangabaclaw/diagnostics-otel");
    expect(clawHubInstallCall()?.expectedPluginId).toBe("diagnostics-otel");
    expectRecordFields(result.config.plugins?.installs?.["diagnostics-otel"], {
      source: "clawhub",
      spec: "clawhub:@mangabaclaw/diagnostics-otel",
      version: "2026.5.4",
      clawhubPackage: "@mangabaclaw/diagnostics-otel",
      clawhubChannel: "official",
    });
    expect(result.config.plugins?.entries?.["diagnostics-otel"]).toEqual({
      enabled: false,
      config: { preserved: true },
    });
  });

  it("updates bare trusted official ClawHub installs through the catalog spec", async () => {
    installPluginFromClawHubMock.mockResolvedValue(
      createSuccessfulClawHubUpdateResult({
        pluginId: "diagnostics-prometheus",
        targetDir: "/tmp/diagnostics-prometheus",
        version: "2026.5.4",
        clawhubPackage: "@mangabaclaw/diagnostics-prometheus",
      }),
    );

    const result = await updateNpmInstalledPlugins({
      config: {
        plugins: {
          installs: {
            "diagnostics-prometheus": {
              source: "clawhub",
              spec: "clawhub:@mangabaclaw/diagnostics-prometheus@2026.5.3",
              installPath: "/tmp/diagnostics-prometheus",
            },
          },
        },
      },
      syncOfficialPluginInstalls: true,
    });

    expect(clawHubInstallCall()?.spec).toBe("clawhub:@mangabaclaw/diagnostics-prometheus");
    expect(clawHubInstallCall()?.expectedPluginId).toBe("diagnostics-prometheus");
    expectRecordFields(result.config.plugins?.installs?.["diagnostics-prometheus"], {
      source: "clawhub",
      spec: "clawhub:@mangabaclaw/diagnostics-prometheus",
      version: "2026.5.4",
      clawhubPackage: "@mangabaclaw/diagnostics-prometheus",
      clawhubChannel: "official",
    });
  });

  it("keeps enabled tracked plugin update failures fatal when disabled skipping is enabled", async () => {
    installPluginFromNpmSpecMock.mockResolvedValue({
      ok: false,
      error: "registry timeout",
    });
    const config = {
      plugins: {
        entries: {
          demo: {
            enabled: true,
          },
        },
        installs: {
          demo: {
            source: "npm" as const,
            spec: "@acme/demo",
            installPath: "/tmp/demo",
          },
        },
      },
    } satisfies MangabaClawConfig;

    const result = await updateNpmInstalledPlugins({
      config,
      skipDisabledPlugins: true,
      dryRun: true,
    });

    expect(npmInstallCall()?.spec).toBe("@acme/demo");
    expect(npmInstallCall()?.expectedPluginId).toBe("demo");
    expect(npmInstallCall()?.dryRun).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.config).toBe(config);
    expect(result.outcomes).toEqual([
      {
        pluginId: "demo",
        status: "error",
        message: "Failed to check demo: registry timeout",
      },
    ]);
  });

  it("disables failed plugin activation without revoking explicit policy", async () => {
    const warn = vi.fn();
    installPluginFromNpmSpecMock.mockResolvedValue({
      ok: false,
      error: "registry timeout",
    });
    const config = {
      plugins: {
        entries: {
          demo: {
            enabled: true,
            config: { preserved: true },
          },
        },
        installs: {
          demo: {
            source: "npm" as const,
            spec: "@acme/demo",
            installPath: "/tmp/demo",
          },
        },
        allow: ["demo", "other"],
        deny: ["blocked"],
        slots: {
          memory: "demo",
          contextEngine: "demo",
        },
      },
    } satisfies MangabaClawConfig;

    const result = await updateNpmInstalledPlugins({
      config,
      skipDisabledPlugins: true,
      disableOnFailure: true,
      logger: { warn },
    });

    expect(npmInstallCall()?.spec).toBe("@acme/demo");
    expect(npmInstallCall()?.expectedPluginId).toBe("demo");
    const message =
      'Disabled "demo" after plugin update failure; MangabaClaw will continue without it. Failed to update demo: registry timeout';
    expect(warn).toHaveBeenCalledWith(message);
    expect(result.changed).toBe(true);
    expect(result.config.plugins?.entries?.demo).toEqual({
      enabled: false,
      config: { preserved: true },
    });
    expect(result.config.plugins?.allow).toEqual(["demo", "other"]);
    expect(result.config.plugins?.deny).toEqual(["blocked"]);
    expect(result.config.plugins?.slots).toBeUndefined();
    expect(result.config.plugins?.installs?.demo).toEqual(config.plugins.installs.demo);
    expect(result.outcomes).toEqual([
      {
        pluginId: "demo",
        status: "skipped",
        message,
      },
    ]);
  });

  it("does not create trust policy when disabling a failed plugin", async () => {
    installPluginFromNpmSpecMock.mockResolvedValue({
      ok: false,
      error: "registry timeout",
    });

    const result = await updateNpmInstalledPlugins({
      config: {
        plugins: {
          entries: { demo: { enabled: true } },
          installs: {
            demo: {
              source: "npm",
              spec: "@acme/demo",
              installPath: "/tmp/demo",
            },
          },
        },
      },
      pluginIds: ["demo"],
      disableOnFailure: true,
    });

    expect(result.changed).toBe(true);
    expect(result.config.plugins?.entries?.demo?.enabled).toBe(false);
    expect(result.config.plugins?.allow).toBeUndefined();
    expect(result.config.plugins?.deny).toBeUndefined();
  });

  it.each([
    {
      name: "keeps an existing ClawHub plugin enabled when a risky update is not acknowledged",
      code: "clawhub_risk_acknowledgement_required",
      version: undefined,
      error:
        "Update cancelled; rerun with --acknowledge-clawhub-risk to continue after reviewing the warning.",
      warning:
        "╭─ WARNING - ClawHub found security risks in this release ─╮\n│ • Finding: suspicious payload strings │\n╰───────────────────────────────────────────────────────────────────────╯",
    },
    {
      name: "keeps an existing ClawHub plugin enabled when a newer target release is blocked",
      code: "clawhub_download_blocked",
      version: "1.2.4",
      error: "ClawHub blocked this release; update was not started.",
      warning:
        "╭─ BLOCKED - ClawHub flagged this release as malicious ─╮\n│ • Security scan: malicious │\n╰────────────────────────────────────────────────────────╯",
    },
    ...["1.2.4", "1.2.3"].map((version) => ({
      name: `keeps an existing ClawHub plugin enabled when ${version === "1.2.4" ? "newer" : "current"} target security data is unavailable`,
      code: "clawhub_security_unavailable",
      version,
      error: `ClawHub release "demo@${version}" could not be checked because ClawHub security data is unavailable. Try again later or choose a different version.`,
      warning: undefined,
    })),
  ])("$name", async ({ code, version, error, warning }) => {
    installPluginFromClawHubMock.mockResolvedValue({
      ok: false,
      code,
      ...(version ? { version } : {}),
      error,
      ...(warning ? { warning } : {}),
    });
    const config = createEnabledDemoClawHubInstallConfig();

    const result = await updatePlugin(config, "demo", { disableOnFailure: true });

    expect(clawHubInstallCall()?.spec).toBe("clawhub:demo");
    expect(result.changed).toBe(false);
    expect(result.config).toBe(config);
    expect(result.config.plugins?.entries?.demo).toEqual({
      enabled: true,
      config: { preserved: true },
    });
    expect(result.config.plugins?.allow).toEqual(["demo"]);
    expect(result.config.plugins?.slots?.memory).toBe("demo");
    expect(result.outcomes).toEqual([
      {
        pluginId: "demo",
        status: "skipped",
        code,
        currentVersion: "1.2.3",
        ...(warning ? { warning } : {}),
        message: `Skipped demo ClawHub update: ${error} Existing installed plugin left unchanged.`,
      },
    ]);
  });

  it("does not skip a risk-gated ClawHub update when the installed package is missing", async () => {
    installPluginFromClawHubMock.mockResolvedValue({
      ok: false,
      code: "clawhub_risk_acknowledgement_required",
      error:
        "Update cancelled; rerun with --acknowledge-clawhub-risk to continue after reviewing the warning.",
      warning:
        "╭─ WARNING - ClawHub found security risks in this release ─╮\n│ • Finding: suspicious payload strings │\n╰───────────────────────────────────────────────────────────────────────╯",
    });
    const installPath = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-plugin-update-missing-"));
    tempDirs.push(installPath);
    const config = createClawHubInstallConfig({ installPath });
    config.plugins = {
      ...config.plugins,
      entries: {
        demo: {
          enabled: true,
          config: { preserved: true },
        },
      },
      allow: ["demo"],
      slots: {
        memory: "demo",
      },
    };

    const result = await updatePlugin(config, "demo", { disableOnFailure: true });

    expect(clawHubInstallCall()?.spec).toBe("clawhub:demo");
    const message =
      'Disabled "demo" after plugin update failure; MangabaClaw will continue without it. Failed to update demo: Update cancelled; rerun with --acknowledge-clawhub-risk to continue after reviewing the warning. (ClawHub clawhub:demo).';
    expect(result.changed).toBe(true);
    expect(result.config.plugins?.entries?.demo).toEqual({
      enabled: false,
      config: { preserved: true },
    });
    expect(result.config.plugins?.allow).toEqual(["demo"]);
    expect(result.config.plugins?.slots?.memory).toBeUndefined();
    expect(result.outcomes).toEqual([
      {
        pluginId: "demo",
        status: "skipped",
        message,
      },
    ]);
  });

  it("disables a blocked ClawHub plugin without changing trust policy", async () => {
    const warn = vi.fn();
    installPluginFromClawHubMock.mockResolvedValue({
      ok: false,
      code: "clawhub_download_blocked",
      version: "1.2.3",
      error: "ClawHub blocked this release; update was not started.",
      warning:
        "╭─ BLOCKED - ClawHub flagged this release as malicious ─╮\n│ • Security scan: malicious │\n╰────────────────────────────────────────────────────────╯",
    });
    const config = createEnabledDemoClawHubInstallConfig();

    const result = await updatePlugin(config, "demo", {
      disableOnFailure: true,
      logger: { warn },
    });

    expect(result.changed).toBe(true);
    expect(result.config.plugins?.entries?.demo).toEqual({
      enabled: false,
      config: { preserved: true },
    });
    expect(result.config.plugins?.allow).toEqual(["demo"]);
    expect(result.config.plugins?.slots).toBeUndefined();
    const message =
      'Disabled "demo" after plugin update failure; MangabaClaw will continue without it. Failed to update demo: ClawHub blocked this release; update was not started. (ClawHub clawhub:demo).';
    expect(warn).toHaveBeenCalledWith(message);
    expect(result.outcomes).toEqual([
      {
        pluginId: "demo",
        status: "skipped",
        message,
      },
    ]);
  });

  it("aborts exact pinned npm plugin updates on integrity drift by default", async () => {
    const warn = vi.fn();
    installPluginFromNpmSpecMock.mockImplementation(
      async (params: {
        spec: string;
        onIntegrityDrift?: (drift: NpmInstallIntegrityDrift) => boolean | Promise<boolean>;
      }) => {
        const proceed = await params.onIntegrityDrift?.({
          spec: params.spec,
          expectedIntegrity: "sha512-old",
          actualIntegrity: "sha512-new",
          resolution: {
            integrity: "sha512-new",
            resolvedSpec: "@opik/opik-mangabaclaw@0.2.5",
            version: "0.2.5",
          },
        });
        if (proceed === false) {
          return {
            ok: false,
            error: "aborted: npm package integrity drift detected for @opik/opik-mangabaclaw@0.2.5",
          };
        }
        return createSuccessfulNpmUpdateResult();
      },
    );

    const config = createNpmInstallConfig({
      pluginId: "opik-mangabaclaw",
      spec: "@opik/opik-mangabaclaw@0.2.5",
      integrity: "sha512-old",
      installPath: "/tmp/opik-mangabaclaw",
    });
    const result = await updatePlugin(config, "opik-mangabaclaw", { logger: { warn } });

    expect(warn).toHaveBeenCalledWith(
      'Integrity drift for "opik-mangabaclaw" (@opik/opik-mangabaclaw@0.2.5): expected sha512-old, got sha512-new',
    );
    expect(result.changed).toBe(false);
    expect(result.config).toBe(config);
    expect(result.outcomes).toEqual([
      {
        pluginId: "opik-mangabaclaw",
        status: "error",
        message:
          "Failed to update opik-mangabaclaw: aborted: npm package integrity drift detected for @opik/opik-mangabaclaw@0.2.5",
      },
    ]);
  });

  it.each([
    {
      name: "formats package-not-found updates with a stable message",
      installerResult: {
        ok: false,
        code: "npm_package_not_found",
        error: "Package not found on npm: @mangabaclaw/missing.",
      },
      config: createNpmInstallConfig({
        pluginId: "missing",
        spec: "@mangabaclaw/missing",
        installPath: "/tmp/missing",
      }),
      pluginId: "missing",
      expectedMessage: "Failed to check missing: npm package not found for @mangabaclaw/missing.",
    },
    {
      name: "falls back to raw installer error for unknown error codes",
      installerResult: {
        ok: false,
        code: "invalid_npm_spec",
        error: "unsupported npm spec: github:evil/evil",
      },
      config: createNpmInstallConfig({
        pluginId: "bad",
        spec: "github:evil/evil",
        installPath: "/tmp/bad",
      }),
      pluginId: "bad",
      expectedMessage: "Failed to check bad: unsupported npm spec: github:evil/evil",
    },
  ] as const)("$name", async ({ installerResult, config, pluginId, expectedMessage }) => {
    installPluginFromNpmSpecMock.mockResolvedValue(installerResult);

    const result = await updateNpmInstalledPlugins({
      config,
      pluginIds: [pluginId],
      dryRun: true,
    });

    expect(result.outcomes).toEqual([
      {
        pluginId,
        status: "error",
        message: expectedMessage,
      },
    ]);
  });

  it.each([
    {
      name: "reuses a recorded npm dist-tag spec for id-based updates",
      installerResult: {
        ok: true,
        pluginId: "mangabaclaw-codex-app-server",
        targetDir: "/tmp/mangabaclaw-codex-app-server",
        version: "0.2.0-beta.4",
        extensions: ["index.ts"],
      },
      config: createCodexAppServerInstallConfig({
        spec: "mangabaclaw-codex-app-server@beta",
        resolvedName: "mangabaclaw-codex-app-server",
        resolvedSpec: "mangabaclaw-codex-app-server@0.2.0-beta.3",
      }),
      expectedSpec: "mangabaclaw-codex-app-server@beta",
      expectedVersion: "0.2.0-beta.4",
    },
    {
      name: "uses and persists an explicit npm spec override during updates",
      installerResult: {
        ok: true,
        pluginId: "mangabaclaw-codex-app-server",
        targetDir: "/tmp/mangabaclaw-codex-app-server",
        version: "0.2.0-beta.4",
        extensions: ["index.ts"],
        npmResolution: {
          name: "mangabaclaw-codex-app-server",
          version: "0.2.0-beta.4",
          resolvedSpec: "mangabaclaw-codex-app-server@0.2.0-beta.4",
        },
      },
      config: createCodexAppServerInstallConfig({
        spec: "mangabaclaw-codex-app-server",
      }),
      specOverrides: {
        "mangabaclaw-codex-app-server": "mangabaclaw-codex-app-server@beta",
      },
      expectedSpec: "mangabaclaw-codex-app-server@beta",
      expectedRecordSpec: "mangabaclaw-codex-app-server@beta",
      expectedVersion: "0.2.0-beta.4",
      expectedResolvedSpec: "mangabaclaw-codex-app-server@0.2.0-beta.4",
    },
  ] as const)(
    "$name",
    async ({
      installerResult,
      config,
      specOverrides,
      expectedSpec,
      expectedRecordSpec,
      expectedVersion,
      expectedResolvedSpec,
    }) => {
      installPluginFromNpmSpecMock.mockResolvedValue(installerResult);

      const result = await updatePlugin(
        config,
        "mangabaclaw-codex-app-server",
        specOverrides ? { specOverrides } : {},
      );

      expectNpmUpdateCall({
        spec: expectedSpec,
        expectedPluginId: "mangabaclaw-codex-app-server",
      });
      expectCodexAppServerInstallState({
        result,
        spec: expectedRecordSpec ?? expectedSpec,
        version: expectedVersion,
        ...(expectedResolvedSpec ? { resolvedSpec: expectedResolvedSpec } : {}),
      });
    },
  );

  it("preserves explicit official npm tag overrides during manual updates", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@mangabaclaw/acpx",
      installedVersion: "2026.5.2",
      registryVersion: "2026.5.3-beta.1",
      installerVersion: "2026.5.3-beta.1",
      installerResolvedSpec: "@mangabaclaw/acpx@2026.5.3-beta.1",
    });
    const result = await updatePlugin(config, "acpx", {
      specOverrides: { acpx: "@mangabaclaw/acpx@beta" },
    });

    expectNpmUpdateCall({
      spec: "@mangabaclaw/acpx@beta",
      expectedPluginId: "acpx",
    });
    expectRecordFields(result.config.plugins?.installs?.acpx, {
      spec: "@mangabaclaw/acpx@beta",
      version: "2026.5.3-beta.1",
      resolvedSpec: "@mangabaclaw/acpx@2026.5.3-beta.1",
    });
  });

  it("tries npm beta for default npm specs on beta channel and preserves the default selector", async () => {
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "mangabaclaw-codex-app-server",
        targetDir: "/tmp/mangabaclaw-codex-app-server",
        version: "0.2.0-beta.4",
        npmResolution: {
          name: "mangabaclaw-codex-app-server",
          version: "0.2.0-beta.4",
          resolvedSpec: "mangabaclaw-codex-app-server@0.2.0-beta.4",
        },
      }),
    );

    const result = await updateNpmInstalledPlugins({
      config: createCodexAppServerInstallConfig({
        spec: "mangabaclaw-codex-app-server",
      }),
      pluginIds: ["mangabaclaw-codex-app-server"],
      updateChannel: "beta",
    });

    expectNpmUpdateCall({
      spec: "mangabaclaw-codex-app-server@beta",
      expectedPluginId: "mangabaclaw-codex-app-server",
    });
    expectCodexAppServerInstallState({
      result,
      spec: "mangabaclaw-codex-app-server",
      version: "0.2.0-beta.4",
      resolvedSpec: "mangabaclaw-codex-app-server@0.2.0-beta.4",
    });
  });

  it("targets the exact core version for official extended-stable updates and preserves intent", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@mangabaclaw/acpx",
      installedVersion: "2026.7.21",
      registryVersion: "2026.7.33",
      installerVersion: "2026.7.33",
      installerResolvedSpec: "@mangabaclaw/acpx@2026.7.33",
    });
    const result = await updatePlugin(config, "acpx", {
      syncOfficialPluginInstalls: true,
      officialPluginUpdateChannel: "extended-stable",
      coreVersion: "2026.7.33",
    });

    expectNpmUpdateCall({
      spec: "@mangabaclaw/acpx@2026.7.33",
      expectedPluginId: "acpx",
    });
    expectRecordFields(result.config.plugins?.installs?.acpx, {
      spec: "@mangabaclaw/acpx",
      version: "2026.7.33",
      resolvedSpec: "@mangabaclaw/acpx@2026.7.33",
    });
  });

  it("preserves an explicit official pin during extended-stable updates", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@mangabaclaw/acpx",
      installedVersion: "2026.6.33",
      spec: "@mangabaclaw/acpx@2026.6.33",
      installerVersion: "2026.6.33",
    });
    await updatePlugin(config, "acpx", {
      syncOfficialPluginInstalls: true,
      officialPluginUpdateChannel: "extended-stable",
      coreVersion: "2026.7.33",
      dryRun: true,
    });

    expectNpmUpdateCall({
      spec: "@mangabaclaw/acpx@2026.6.33",
      expectedPluginId: "acpx",
    });
  });

  it("lets an explicit bare official spec opt a legacy pin into exact-core tracking", async () => {
    const { config } = createNpmUpdateFixture({
      pluginId: "acpx",
      packageName: "@mangabaclaw/acpx",
      installedVersion: "2026.6.21",
      registryVersion: "2026.7.33",
      spec: "@mangabaclaw/acpx@2026.6.21",
      installerVersion: "2026.7.33",
      installerResolvedSpec: "@mangabaclaw/acpx@2026.7.33",
    });
    const result = await updatePlugin(config, "acpx", {
      specOverrides: { acpx: "@mangabaclaw/acpx" },
      syncOfficialPluginInstalls: true,
      officialPluginUpdateChannel: "extended-stable",
      coreVersion: "2026.7.33",
    });

    expectNpmUpdateCall({
      spec: "@mangabaclaw/acpx@2026.7.33",
      expectedPluginId: "acpx",
    });
    expectRecordFields(result.config.plugins?.installs?.acpx, {
      spec: "@mangabaclaw/acpx",
      version: "2026.7.33",
      resolvedSpec: "@mangabaclaw/acpx@2026.7.33",
    });
  });

  it("falls back to the default npm spec when a beta tag is unavailable", async () => {
    installPluginFromNpmSpecMock
      .mockResolvedValueOnce({
        ok: false,
        error:
          "npm ERR! code ETARGET\nnpm ERR! No matching version found for mangabaclaw-codex-app-server@beta.",
      })
      .mockResolvedValueOnce(
        createSuccessfulNpmUpdateResult({
          pluginId: "mangabaclaw-codex-app-server",
          targetDir: "/tmp/mangabaclaw-codex-app-server",
          version: "0.2.6",
          npmResolution: {
            name: "mangabaclaw-codex-app-server",
            version: "0.2.6",
            resolvedSpec: "mangabaclaw-codex-app-server@0.2.6",
          },
        }),
      );

    const config = createCodexAppServerInstallConfig({
      spec: "mangabaclaw-codex-app-server",
    });
    const warnMessages: string[] = [];
    const result = await updatePlugin(config, "mangabaclaw-codex-app-server", {
      updateChannel: "beta",
      logger: { warn: (msg) => warnMessages.push(msg) },
    });

    expect(npmInstallCall(0)?.spec).toBe("mangabaclaw-codex-app-server@beta");
    expect(npmInstallCall(1)?.spec).toBe("mangabaclaw-codex-app-server");
    expect(npmInstallCall(1)?.config).toBe(config);
    expect(warnMessages).toEqual([
      'Plugin "mangabaclaw-codex-app-server" has no beta npm release for mangabaclaw-codex-app-server@beta; using mangabaclaw-codex-app-server instead. Core update can still complete.',
    ]);
    expectCodexAppServerInstallState({
      result,
      spec: "mangabaclaw-codex-app-server",
      version: "0.2.6",
      resolvedSpec: "mangabaclaw-codex-app-server@0.2.6",
    });
    expect(result.outcomes[0]?.message).toBe(
      "Updated mangabaclaw-codex-app-server: unknown -> 0.2.6. (warning: beta channel fallback used mangabaclaw-codex-app-server because mangabaclaw-codex-app-server@beta could not be used).",
    );
    expect(result.outcomes[0]?.channelFallback).toEqual({
      requestedSpec: "mangabaclaw-codex-app-server@beta",
      usedSpec: "mangabaclaw-codex-app-server",
      requestedLabel: "@beta",
      usedLabel: "@latest",
      reason: "unavailable",
      message:
        "plugin channel fallback: mangabaclaw-codex-app-server used @latest because @beta was unavailable",
    });
  });

  it("reports npm beta fallback as tentative during dry-run checks", async () => {
    installPluginFromNpmSpecMock
      .mockResolvedValueOnce({
        ok: false,
        error:
          "npm ERR! code ETARGET\nnpm ERR! No matching version found for mangabaclaw-codex-app-server@beta.",
      })
      .mockResolvedValueOnce(
        createSuccessfulNpmUpdateResult({
          pluginId: "mangabaclaw-codex-app-server",
          targetDir: "/tmp/mangabaclaw-codex-app-server",
          version: "0.2.6",
          npmResolution: {
            name: "mangabaclaw-codex-app-server",
            version: "0.2.6",
            resolvedSpec: "mangabaclaw-codex-app-server@0.2.6",
          },
        }),
      );

    const result = await updateNpmInstalledPlugins({
      config: createCodexAppServerInstallConfig({
        spec: "mangabaclaw-codex-app-server",
      }),
      pluginIds: ["mangabaclaw-codex-app-server"],
      updateChannel: "beta",
      dryRun: true,
    });

    expect(result.outcomes[0]?.message).toBe(
      "Would update mangabaclaw-codex-app-server: unknown -> 0.2.6. (warning: beta channel fallback would use mangabaclaw-codex-app-server because mangabaclaw-codex-app-server@beta could not be used).",
    );
    expect(result.outcomes[0]?.channelFallback?.message).toBe(
      "plugin channel fallback: mangabaclaw-codex-app-server would use @latest because @beta was unavailable",
    );
  });

  it("falls back to the default npm spec when the beta package exists but is invalid", async () => {
    installPluginFromNpmSpecMock
      .mockResolvedValueOnce({
        ok: false,
        error: "Installed plugin package uses a TypeScript entry without compiled runtime output.",
      })
      .mockResolvedValueOnce(
        createSuccessfulNpmUpdateResult({
          pluginId: "mangabaclaw-codex-app-server",
          targetDir: "/tmp/mangabaclaw-codex-app-server",
          version: "0.2.6",
          npmResolution: {
            name: "mangabaclaw-codex-app-server",
            version: "0.2.6",
            resolvedSpec: "mangabaclaw-codex-app-server@0.2.6",
          },
        }),
      );

    const warnMessages: string[] = [];
    const result = await updateNpmInstalledPlugins({
      config: createCodexAppServerInstallConfig({
        spec: "mangabaclaw-codex-app-server",
      }),
      pluginIds: ["mangabaclaw-codex-app-server"],
      updateChannel: "beta",
      logger: { warn: (msg) => warnMessages.push(msg) },
    });

    expect(npmInstallCall(0)?.spec).toBe("mangabaclaw-codex-app-server@beta");
    expect(npmInstallCall(1)?.spec).toBe("mangabaclaw-codex-app-server");
    expect(warnMessages).toEqual([
      'Plugin "mangabaclaw-codex-app-server" failed beta npm update for mangabaclaw-codex-app-server@beta; using mangabaclaw-codex-app-server instead. Core update can still complete.',
    ]);
    expectCodexAppServerInstallState({
      result,
      spec: "mangabaclaw-codex-app-server",
      version: "0.2.6",
      resolvedSpec: "mangabaclaw-codex-app-server@0.2.6",
    });
    expect(result.outcomes[0]?.message).toBe(
      "Updated mangabaclaw-codex-app-server: unknown -> 0.2.6. (warning: beta channel fallback used mangabaclaw-codex-app-server because mangabaclaw-codex-app-server@beta could not be used).",
    );
    expect(result.outcomes[0]?.channelFallback).toMatchObject({
      requestedLabel: "@beta",
      usedLabel: "@latest",
      reason: "failed",
      message: "plugin channel fallback: mangabaclaw-codex-app-server used @latest after @beta failed",
    });
  });

  it.each(["security_scan_blocked", "security_scan_failed"] as const)(
    "does not bypass %s with the beta npm fallback",
    async (code) => {
      installPluginFromNpmSpecMock.mockResolvedValueOnce({
        ok: false,
        code,
        error: `install policy returned ${code}`,
      });

      const result = await updatePlugin(
        createCodexAppServerInstallConfig({ spec: "mangabaclaw-codex-app-server" }),
        "mangabaclaw-codex-app-server",
        { updateChannel: "beta" },
      );

      expect(installPluginFromNpmSpecMock).toHaveBeenCalledTimes(1);
      expect(result.outcomes[0]).toMatchObject({
        status: "error",
        message: `Failed to update mangabaclaw-codex-app-server: install policy returned ${code}`,
      });
    },
  );

  it.each([
    {
      name: "reports the fallback npm spec when beta fallback also fails",
      dryRun: false,
      action: "update",
      fallbackVerb: "used",
      assertInstallerCalls: true,
    },
    {
      name: "keeps fallback metadata when a dry-run beta fallback also fails",
      dryRun: true,
      action: "check",
      fallbackVerb: "would use",
      assertInstallerCalls: false,
    },
  ] as const)("$name", async ({ dryRun, action, fallbackVerb, assertInstallerCalls }) => {
    installPluginFromNpmSpecMock
      .mockResolvedValueOnce({
        ok: false,
        error: "Installed plugin package uses a TypeScript entry without compiled runtime output.",
      })
      .mockResolvedValueOnce({
        ok: false,
        code: "npm_package_not_found",
        error: "npm package not found",
      });

    const result = await updatePlugin(
      createCodexAppServerInstallConfig({ spec: "mangabaclaw-codex-app-server" }),
      "mangabaclaw-codex-app-server",
      { updateChannel: "beta", ...(dryRun ? { dryRun: true } : {}) },
    );

    if (assertInstallerCalls) {
      expect(installPluginFromNpmSpecMock).toHaveBeenCalledTimes(2);
    }
    expect(result.outcomes).toEqual([
      {
        pluginId: "mangabaclaw-codex-app-server",
        status: "error",
        message: `Failed to ${action} mangabaclaw-codex-app-server: npm package not found for mangabaclaw-codex-app-server.`,
        channelFallback: {
          requestedSpec: "mangabaclaw-codex-app-server@beta",
          usedSpec: "mangabaclaw-codex-app-server",
          requestedLabel: "@beta",
          usedLabel: "@latest",
          reason: "failed",
          message: `plugin channel fallback: mangabaclaw-codex-app-server ${fallbackVerb} @latest after @beta failed`,
        },
      },
    ]);
  });

  it("preserves explicit npm tags when updating on the beta channel", async () => {
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "mangabaclaw-codex-app-server",
        targetDir: "/tmp/mangabaclaw-codex-app-server",
        version: "0.2.0-rc.1",
      }),
    );

    await updateNpmInstalledPlugins({
      config: createCodexAppServerInstallConfig({
        spec: "mangabaclaw-codex-app-server@rc",
      }),
      pluginIds: ["mangabaclaw-codex-app-server"],
      updateChannel: "beta",
      dryRun: true,
    });

    expectNpmUpdateCall({
      spec: "mangabaclaw-codex-app-server@rc",
      expectedPluginId: "mangabaclaw-codex-app-server",
    });
  });

  it("updates ClawHub-installed plugins via recorded package metadata", async () => {
    installPluginFromClawHubMock.mockResolvedValue({
      ok: true,
      pluginId: "demo",
      targetDir: "/tmp/demo",
      version: "1.2.4",
      clawhub: {
        source: "clawhub",
        clawhubUrl: "https://clawhub.ai",
        clawhubPackage: "demo",
        clawhubFamily: "code-plugin",
        clawhubChannel: "official",
        artifactKind: "npm-pack",
        artifactFormat: "tgz",
        npmIntegrity: "sha512-next",
        npmShasum: "1".repeat(40),
        npmTarballName: "demo-1.2.4.tgz",
        integrity: "sha256-next",
        resolvedAt: "2026-03-22T00:00:00.000Z",
        clawpackSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        clawpackSpecVersion: 1,
        clawpackManifestSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        clawpackSize: 4096,
      },
    });

    const config = createClawHubInstallConfig();
    delete config.plugins?.installs?.demo?.clawhubPackage;
    config.plugins!.installs!.demo!.resolvedSpec = "clawhub:demo@1.2.3";
    delete config.plugins?.installs?.demo?.spec;
    const result = await updatePlugin(config, "demo", { timeoutMs: 1_800_000 });

    expect(clawHubInstallCall()?.spec).toBe("clawhub:demo@1.2.3");
    expect(clawHubInstallCall()?.baseUrl).toBe("https://clawhub.ai");
    expect(clawHubInstallCall()?.expectedPluginId).toBe("demo");
    expect(clawHubInstallCall()?.mode).toBe("update");
    expect(clawHubInstallCall()?.timeoutMs).toBe(1_800_000);
    expect(withClawPackageLifecycleLeaseMock).toHaveBeenCalledWith(
      { kind: "plugin", source: "clawhub", ref: "demo" },
      expect.any(Function),
      { required: true },
    );
    expect(markClawPackageIndependentlyOwnedMock).toHaveBeenCalledWith({
      kind: "plugin",
      source: "clawhub",
      ref: "demo",
    });
    expectRecordFields(result.config.plugins?.installs?.demo, {
      source: "clawhub",
      spec: "clawhub:demo@1.2.3",
      installPath: "/tmp/demo",
      version: "1.2.4",
      clawhubPackage: "demo",
      clawhubFamily: "code-plugin",
      clawhubChannel: "official",
      artifactKind: "npm-pack",
      artifactFormat: "tgz",
      npmIntegrity: "sha512-next",
      npmShasum: "1".repeat(40),
      npmTarballName: "demo-1.2.4.tgz",
      integrity: "sha256-next",
      clawpackSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      clawpackSpecVersion: 1,
      clawpackManifestSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      clawpackSize: 4096,
    });
  });

  it("records a busy ClawHub lifecycle lease as one plugin update failure", async () => {
    withClawPackageLifecycleLeaseMock.mockRejectedValueOnce(new Error("package busy"));
    const result = await updatePlugin(createClawHubInstallConfig(), "demo");

    expect(result.outcomes).toContainEqual(
      expect.objectContaining({
        pluginId: "demo",
        status: "error",
        message: expect.stringContaining("package busy"),
      }),
    );
    expect(installPluginFromClawHubMock).not.toHaveBeenCalled();
  });

  it("tries ClawHub beta for default ClawHub specs on beta channel without persisting the beta tag", async () => {
    installPluginFromClawHubMock.mockResolvedValue(
      createSuccessfulClawHubUpdateResult({
        pluginId: "demo",
        targetDir: "/tmp/demo",
        version: "1.3.0-beta.1",
        clawhubPackage: "demo",
      }),
    );

    const result = await updatePlugin(createClawHubInstallConfig(), "demo", {
      updateChannel: "beta",
    });

    expect(clawHubInstallCall()?.spec).toBe("clawhub:demo@beta");
    expect(clawHubInstallCall()?.baseUrl).toBe("https://clawhub.ai");
    expect(clawHubInstallCall()?.expectedPluginId).toBe("demo");
    expectRecordFields(result.config.plugins?.installs?.demo, {
      source: "clawhub",
      spec: "clawhub:demo",
      installPath: "/tmp/demo",
      version: "1.3.0-beta.1",
      clawhubPackage: "demo",
    });
  });

  it("uses the beta core channel for a targeted official ClawHub install with npm-only catalog metadata", async () => {
    installPluginFromClawHubMock.mockResolvedValue(
      createSuccessfulClawHubUpdateResult({
        pluginId: "discord",
        targetDir: "/tmp/discord",
        version: "2026.5.4-beta.1",
        clawhubPackage: "@mangabaclaw/discord",
      }),
    );

    const result = await updatePlugin(
      createClawHubInstallConfig({
        pluginId: "discord",
        clawhubPackage: "@mangabaclaw/discord",
      }),
      "discord",
      { officialPluginUpdateChannel: "beta" },
    );

    expect(clawHubInstallCall()?.spec).toBe("clawhub:@mangabaclaw/discord@beta");
    expectRecordFields(result.config.plugins?.installs?.discord, {
      source: "clawhub",
      spec: "clawhub:@mangabaclaw/discord",
      version: "2026.5.4-beta.1",
      clawhubPackage: "@mangabaclaw/discord",
    });
  });

  it("does not apply the official beta channel to custom ClawHub provenance", async () => {
    installPluginFromClawHubMock.mockResolvedValue(
      createSuccessfulClawHubUpdateResult({
        pluginId: "discord",
        targetDir: "/tmp/discord",
        version: "2026.5.4",
        clawhubPackage: "@mangabaclaw/discord",
      }),
    );

    await updatePlugin(
      createClawHubInstallConfig({
        pluginId: "discord",
        clawhubPackage: "@mangabaclaw/discord",
        clawhubUrl: "https://custom-clawhub.example",
      }),
      "discord",
      { officialPluginUpdateChannel: "beta" },
    );

    expect(clawHubInstallCall()?.spec).toBe("clawhub:@mangabaclaw/discord");
  });

  it("falls back to the default ClawHub spec when a beta release is unavailable", async () => {
    installPluginFromClawHubMock
      .mockResolvedValueOnce({
        ok: false,
        code: "version_not_found",
        error: "version not found: beta",
      })
      .mockResolvedValueOnce(
        createSuccessfulClawHubUpdateResult({
          pluginId: "demo",
          targetDir: "/tmp/demo",
          version: "1.2.4",
          clawhubPackage: "demo",
        }),
      );

    const warnMessages: string[] = [];
    const result = await updatePlugin(createClawHubInstallConfig(), "demo", {
      updateChannel: "beta",
      logger: { warn: (msg) => warnMessages.push(msg) },
    });

    expect(clawHubInstallCall(0)?.spec).toBe("clawhub:demo@beta");
    expect(clawHubInstallCall(1)?.spec).toBe("clawhub:demo");
    expect(warnMessages).toEqual([
      'Plugin "demo" has no beta ClawHub release for clawhub:demo@beta; using clawhub:demo instead. Core update can still complete.',
    ]);
    expectRecordFields(result.config.plugins?.installs?.demo, {
      source: "clawhub",
      spec: "clawhub:demo",
      installPath: "/tmp/demo",
      version: "1.2.4",
      clawhubPackage: "demo",
    });
    expect(result.outcomes[0]?.message).toBe(
      "Updated demo: unknown -> 1.2.4. (warning: beta channel fallback used clawhub:demo because clawhub:demo@beta could not be used).",
    );
  });

  it("does not fall back to npm for blocked official ClawHub artifact downloads", async () => {
    const warnMessages: string[] = [];
    const installPath = createInstalledPackageDir({
      name: "@mangabaclaw/discord",
      version: "2026.5.12",
    });
    installPluginFromClawHubMock.mockResolvedValueOnce({
      ok: false,
      code: "clawhub_download_blocked",
      error:
        'ClawHub blocked artifact download for "@mangabaclaw/discord@2026.5.16-beta.5"; install was not started. ClawHub /api/v1/packages/%40mangabaclaw%2Fdiscord/versions/2026.5.16-beta.5/artifact/download failed (403): Blocked: this package release has been flagged as malicious and cannot be downloaded.',
      version: "2026.5.16-beta.5",
    });

    const result = await updatePlugin(
      createClawHubInstallConfig({
        pluginId: "discord",
        installPath,
        clawhubPackage: "@mangabaclaw/discord",
      }),
      "discord",
      {
        updateChannel: "beta",
        disableOnFailure: true,
        logger: { warn: (msg) => warnMessages.push(msg) },
      },
    );

    expect(clawHubInstallCall()?.spec).toBe("clawhub:@mangabaclaw/discord@beta");
    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.config.plugins?.entries?.discord?.enabled).toBeUndefined();
    expectRecordFields(result.config.plugins?.installs?.discord, {
      source: "clawhub",
      spec: "clawhub:@mangabaclaw/discord",
      installPath,
      clawhubPackage: "@mangabaclaw/discord",
    });
    expect(result.outcomes).toEqual([
      {
        pluginId: "discord",
        status: "skipped",
        code: "clawhub_download_blocked",
        currentVersion: "2026.5.12",
        message:
          'Skipped discord ClawHub update: ClawHub blocked artifact download for "@mangabaclaw/discord@2026.5.16-beta.5"; install was not started. ClawHub /api/v1/packages/%40mangabaclaw%2Fdiscord/versions/2026.5.16-beta.5/artifact/download failed (403): Blocked: this package release has been flagged as malicious and cannot be downloaded. Existing installed plugin left unchanged.',
      },
    ]);
    expect(warnMessages).toStrictEqual([]);
  });

  it("uses the default npm spec when beta ClawHub falls back before an artifact block", async () => {
    const warnMessages: string[] = [];
    const installPath = createInstalledPackageDir({
      name: "@mangabaclaw/discord",
      version: "2026.5.12",
    });
    installPluginFromClawHubMock
      .mockResolvedValueOnce({
        ok: false,
        code: "version_not_found",
        error: "version not found: beta",
      })
      .mockResolvedValueOnce({
        ok: false,
        code: "artifact_unavailable",
        error: "artifact unavailable",
      });
    installPluginFromNpmSpecMock.mockResolvedValueOnce(
      createSuccessfulNpmUpdateResult({
        pluginId: "discord",
        targetDir: "/tmp/mangabaclaw-plugins/discord",
        version: "2026.5.16",
        npmResolution: {
          name: "@mangabaclaw/discord",
          version: "2026.5.16",
          resolvedSpec: "@mangabaclaw/discord@2026.5.16",
        },
      }),
    );

    const result = await updatePlugin(
      createClawHubInstallConfig({
        pluginId: "discord",
        installPath,
        clawhubPackage: "@mangabaclaw/discord",
      }),
      "discord",
      {
        updateChannel: "beta",
        logger: { warn: (msg) => warnMessages.push(msg) },
      },
    );

    expect(clawHubInstallCall(0)?.spec).toBe("clawhub:@mangabaclaw/discord@beta");
    expect(clawHubInstallCall(1)?.spec).toBe("clawhub:@mangabaclaw/discord");
    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/discord");
    expectRecordFields(result.config.plugins?.installs?.discord, {
      source: "npm",
      spec: "@mangabaclaw/discord@2026.5.16",
      installPath: "/tmp/mangabaclaw-plugins/discord",
      version: "2026.5.16",
    });
    expect(result.outcomes[0]?.message).toBe(
      "Updated discord: 2026.5.12 -> 2026.5.16. (warning: official ClawHub artifact fallback used @mangabaclaw/discord).",
    );
    expect(warnMessages).toEqual([
      'Plugin "discord" has no beta ClawHub release for clawhub:@mangabaclaw/discord@beta; using clawhub:@mangabaclaw/discord instead. Core update can still complete.',
      'Plugin "discord" could not download official ClawHub artifact for clawhub:@mangabaclaw/discord; using npm @mangabaclaw/discord instead. Core update can still complete.',
    ]);
  });

  it("uses exact-core npm when an official ClawHub install falls back on extended-stable", async () => {
    const installPath = createInstalledPackageDir({
      name: "@mangabaclaw/discord",
      version: "2026.6.33",
    });
    installPluginFromClawHubMock.mockResolvedValueOnce({
      ok: false,
      code: "artifact_unavailable",
      error: "artifact unavailable",
    });
    installPluginFromNpmSpecMock.mockResolvedValueOnce(
      createSuccessfulNpmUpdateResult({
        pluginId: "discord",
        targetDir: "/tmp/mangabaclaw-plugins/discord",
        version: "2026.7.33",
        npmResolution: {
          name: "@mangabaclaw/discord",
          version: "2026.7.33",
          resolvedSpec: "@mangabaclaw/discord@2026.7.33",
        },
      }),
    );

    const result = await updatePlugin(
      createClawHubInstallConfig({
        pluginId: "discord",
        installPath,
        clawhubPackage: "@mangabaclaw/discord",
      }),
      "discord",
      {
        syncOfficialPluginInstalls: true,
        officialPluginUpdateChannel: "extended-stable",
        coreVersion: "2026.7.33",
      },
    );

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/discord@2026.7.33");
    expectRecordFields(result.config.plugins?.installs?.discord, {
      source: "npm",
      spec: "@mangabaclaw/discord",
      version: "2026.7.33",
      resolvedSpec: "@mangabaclaw/discord@2026.7.33",
    });
  });

  it("reports npm dry-run versions for trusted official ClawHub artifact fallback", async () => {
    const installPath = createInstalledPackageDir({
      name: "@mangabaclaw/discord",
      version: "2026.5.16-beta.5",
    });
    installPluginFromClawHubMock.mockResolvedValueOnce({
      ok: false,
      code: "artifact_unavailable",
      error: "artifact unavailable",
    });
    installPluginFromNpmSpecMock.mockResolvedValueOnce({
      ok: true,
      pluginId: "discord",
      targetDir: "/tmp/mangabaclaw-plugins/discord",
      extensions: [],
      npmResolution: {
        name: "@mangabaclaw/discord",
        version: "2026.5.16-beta.5",
        resolvedSpec: "@mangabaclaw/discord@2026.5.16-beta.5",
      },
    });

    const result = await updatePlugin(
      createClawHubInstallConfig({
        pluginId: "discord",
        installPath,
        clawhubPackage: "@mangabaclaw/discord",
      }),
      "discord",
      {
        updateChannel: "beta",
        dryRun: true,
      },
    );

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/discord@beta");
    expect(npmInstallCall()?.dryRun).toBe(true);
    expect(result.outcomes).toEqual([
      {
        pluginId: "discord",
        status: "unchanged",
        currentVersion: "2026.5.16-beta.5",
        nextVersion: "2026.5.16-beta.5",
        message:
          "discord is up to date (2026.5.16-beta.5). (warning: official ClawHub artifact fallback would use @mangabaclaw/discord@beta).",
      },
    ]);
  });

  it("does not fall back to trusted npm from custom ClawHub provenance", async () => {
    const installPath = createInstalledPackageDir({
      name: "@mangabaclaw/discord",
      version: "2026.5.12",
    });
    installPluginFromClawHubMock.mockResolvedValueOnce({
      ok: false,
      code: "artifact_unavailable",
      error: "artifact unavailable",
    });

    const result = await updatePlugin(
      createClawHubInstallConfig({
        pluginId: "discord",
        installPath,
        clawhubUrl: "https://custom-clawhub.example",
        clawhubPackage: "@mangabaclaw/discord",
      }),
      "discord",
      { updateChannel: "beta" },
    );

    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.outcomes).toEqual([
      {
        pluginId: "discord",
        status: "error",
        message:
          "Failed to update discord: artifact unavailable (ClawHub clawhub:@mangabaclaw/discord@beta).",
      },
    ]);
  });

  it("preserves explicit ClawHub tags when updating on the beta channel", async () => {
    installPluginFromClawHubMock.mockResolvedValue(
      createSuccessfulClawHubUpdateResult({
        pluginId: "demo",
        targetDir: "/tmp/demo",
        version: "1.3.0-rc.1",
        clawhubPackage: "demo",
      }),
    );

    await updatePlugin(createClawHubInstallConfig({ spec: "clawhub:demo@rc" }), "demo", {
      updateChannel: "beta",
      dryRun: true,
    });

    expect(clawHubInstallCall()?.spec).toBe("clawhub:demo@rc");
  });

  it.each([
    {
      name: "skips ClawHub plugin update when bundled version is newer",
      pluginId: "whatsapp",
      bundledVersion: "2026.4.20",
      installedVersion: "2026.2.9",
      clawhubFamily: "bundle-plugin",
      clawhubChannel: "community",
      nextVersion: undefined,
    },
    {
      name: "proceeds with ClawHub plugin update when bundled version is older",
      pluginId: "demo",
      bundledVersion: "1.0.0",
      installedVersion: "1.5.0",
      clawhubFamily: "code-plugin",
      clawhubChannel: "official",
      nextVersion: "2.0.0",
    },
    {
      name: "does not treat an older bundled stable release as newer than an installed correction release",
      pluginId: "demo",
      bundledVersion: "2026.5.3",
      installedVersion: "2026.5.3-1",
      clawhubFamily: "code-plugin",
      clawhubChannel: "official",
      nextVersion: "2026.5.3-2",
    },
  ] as const)(
    "$name",
    async ({
      pluginId,
      bundledVersion,
      installedVersion,
      clawhubFamily,
      clawhubChannel,
      nextVersion,
    }) => {
      resolveBundledPluginSourcesMock.mockReturnValue(
        new Map([
          [
            pluginId,
            { pluginId, localPath: appBundledPluginRoot(pluginId), version: bundledVersion },
          ],
        ]),
      );
      if (nextVersion) {
        installPluginFromClawHubMock.mockResolvedValue(
          createSuccessfulClawHubUpdateResult({
            pluginId,
            targetDir: `/tmp/${pluginId}`,
            version: nextVersion,
            clawhubPackage: pluginId,
          }),
        );
      }
      const config = createClawHubInstallConfig({ pluginId, clawhubFamily, clawhubChannel });
      const install = config.plugins?.installs?.[pluginId];
      if (!install) {
        throw new Error(`Missing ClawHub install fixture for ${pluginId}`);
      }
      install.version = installedVersion;
      const warnings: string[] = [];
      const result = await updatePlugin(config, pluginId, {
        logger: { warn: (message) => warnings.push(message) },
      });

      if (!nextVersion) {
        expect(installPluginFromClawHubMock).not.toHaveBeenCalled();
        expect(result.changed).toBe(false);
        expect(result.outcomes).toHaveLength(1);
        expectRecordFields(result.outcomes[0], { pluginId, status: "skipped" });
        expect(result.outcomes[0]?.message).toContain(`bundled version ${bundledVersion} is newer`);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(`bundled version ${bundledVersion} is newer`);
        return;
      }

      expect(installPluginFromClawHubMock).toHaveBeenCalled();
      expect(result.changed).toBe(true);
      if (installedVersion.includes("-")) {
        expectRecordFields(result.outcomes[0], {
          pluginId,
          status: "updated",
          currentVersion: undefined,
          nextVersion,
        });
      }
    },
  );

  it("forwards ClawHub risk acknowledgement inputs without dry-run prompts", async () => {
    const onClawHubRisk = vi.fn(async () => true);
    const config = createClawHubInstallConfig();
    installPluginFromClawHubMock.mockResolvedValue({
      ok: true,
      pluginId: "demo",
      targetDir: "/tmp/demo",
      version: "1.2.4",
      clawhub: {
        source: "clawhub",
        clawhubUrl: "https://clawhub.ai",
        clawhubPackage: "demo",
        clawhubFamily: "code-plugin",
        clawhubChannel: "official",
        integrity: "sha256-next",
        resolvedAt: "2026-03-22T00:00:00.000Z",
      },
    });

    for (const dryRun of [true, false]) {
      installPluginFromClawHubMock.mockClear();

      await updatePlugin(config, "demo", {
        acknowledgeClawHubRisk: true,
        onClawHubRisk,
        ...(dryRun ? { dryRun: true } : {}),
      });

      expect(installPluginFromClawHubMock).toHaveBeenCalledWith(
        expect.objectContaining({
          spec: "clawhub:demo",
          acknowledgeClawHubRisk: true,
          ...(dryRun ? { dryRun: true } : {}),
          ...(!dryRun ? { onClawHubRisk } : {}),
        }),
      );
      if (dryRun) {
        expect(clawHubInstallCall()?.onClawHubRisk).toBeUndefined();
      }
    }
  });

  it("migrates legacy unscoped install keys when a scoped npm package updates", async () => {
    installPluginFromNpmSpecMock.mockResolvedValue({
      ok: true,
      pluginId: "@mangabaclaw/voice-call",
      targetDir: "/tmp/mangabaclaw-voice-call",
      version: "0.0.2",
      extensions: ["index.ts"],
    });

    const result = await updateNpmInstalledPlugins({
      config: {
        plugins: {
          allow: ["voice-call"],
          deny: ["voice-call"],
          slots: { memory: "voice-call" },
          entries: {
            "voice-call": {
              enabled: false,
              hooks: { allowPromptInjection: false },
            },
          },
          installs: {
            "voice-call": {
              source: "npm",
              spec: "@mangabaclaw/voice-call",
              installPath: "/tmp/voice-call",
            },
          },
        },
      },
      pluginIds: ["voice-call"],
    });

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/voice-call");
    expect(npmInstallCall()?.expectedPluginId).toBe("voice-call");
    expect(result.config.plugins?.allow).toEqual(["@mangabaclaw/voice-call"]);
    expect(result.config.plugins?.deny).toEqual(["@mangabaclaw/voice-call"]);
    expect(result.config.plugins?.slots?.memory).toBe("@mangabaclaw/voice-call");
    expect(result.config.plugins?.entries?.["@mangabaclaw/voice-call"]).toEqual({
      enabled: false,
      hooks: { allowPromptInjection: false },
    });
    expect(result.config.plugins?.entries?.["voice-call"]).toBeUndefined();
    expectRecordFields(result.config.plugins?.installs?.["@mangabaclaw/voice-call"], {
      source: "npm",
      spec: "@mangabaclaw/voice-call",
      installPath: "/tmp/mangabaclaw-voice-call",
      version: "0.0.2",
    });
    expect(result.config.plugins?.installs?.["voice-call"]).toBeUndefined();
  });

  it.each([
    {
      name: "beta",
      params: { officialPluginUpdateChannel: "beta" as const },
      expectedInstallSpec: "@mangabaclaw/fish-audio-speech@beta",
      expectedRecordSpec: "@mangabaclaw/fish-audio-speech",
    },
    {
      name: "stable",
      params: { officialPluginUpdateChannel: "stable" as const },
      expectedInstallSpec: "@mangabaclaw/fish-audio-speech",
      expectedRecordSpec: "@mangabaclaw/fish-audio-speech",
    },
    {
      name: "extended-stable",
      params: {
        officialPluginUpdateChannel: "extended-stable" as const,
        coreVersion: "2026.8.1",
      },
      expectedInstallSpec: "@mangabaclaw/fish-audio-speech@2026.8.1",
      expectedRecordSpec: "@mangabaclaw/fish-audio-speech",
    },
    {
      name: "explicit override",
      params: {
        officialPluginUpdateChannel: "beta" as const,
        specOverrides: { "fish-audio": "@mangabaclaw/fish-audio-speech@next" },
      },
      expectedInstallSpec: "@mangabaclaw/fish-audio-speech@next",
      expectedRecordSpec: "@mangabaclaw/fish-audio-speech@next",
    },
  ])(
    "selects the $name package line when migrating a manifest-declared legacy id",
    async ({ params, expectedInstallSpec, expectedRecordSpec }) => {
      installPluginFromNpmSpecMock.mockResolvedValue({
        ok: true,
        pluginId: "fish-audio-speech",
        targetDir: "/tmp/fish-audio-speech",
        version: "2026.8.1",
        extensions: ["index.js"],
      });

      const result = await updateNpmInstalledPlugins({
        config: {
          plugins: {
            allow: ["fish-audio"],
            entries: { "fish-audio": { enabled: true } },
            installs: {
              "fish-audio": {
                source: "npm",
                spec: "@mangabaclaw/fish-audio-speech@2026.7.2-beta.7",
                resolvedName: "@mangabaclaw/fish-audio-speech",
                resolvedSpec: "@mangabaclaw/fish-audio-speech@2026.7.2-beta.7",
                installPath: "/tmp/fish-audio",
              },
            },
          },
        },
        pluginIds: ["fish-audio"],
        ...params,
      });

      expectNpmUpdateCall({
        spec: expectedInstallSpec,
        expectedPluginId: "fish-audio",
      });
      expect(npmInstallCall()?.expectedReplacementPluginId).toBe("fish-audio-speech");
      expect(npmInstallCall()?.trustedSourceLinkedOfficialInstall).toBe(true);
      expect(result.config.plugins?.allow).toEqual(["fish-audio-speech"]);
      expect(result.config.plugins?.entries?.["fish-audio-speech"]).toEqual({ enabled: true });
      expect(result.config.plugins?.entries?.["fish-audio"]).toBeUndefined();
      expectRecordFields(result.config.plugins?.installs?.["fish-audio-speech"], {
        source: "npm",
        spec: expectedRecordSpec,
        installPath: "/tmp/fish-audio-speech",
        version: "2026.8.1",
      });
      expect(result.config.plugins?.installs?.["fish-audio"]).toBeUndefined();
    },
  );

  it("rejects legacy id replacement when the canonical install already exists", async () => {
    const config = {
      plugins: {
        installs: {
          "fish-audio": {
            source: "npm",
            spec: "@mangabaclaw/fish-audio-speech@2026.7.2-beta.7",
            resolvedName: "@mangabaclaw/fish-audio-speech",
            resolvedSpec: "@mangabaclaw/fish-audio-speech@2026.7.2-beta.7",
            installPath: "/tmp/fish-audio-legacy",
          },
          "fish-audio-speech": {
            source: "npm",
            spec: "@mangabaclaw/fish-audio-speech@2026.8.1-beta.1",
            resolvedName: "@mangabaclaw/fish-audio-speech",
            resolvedSpec: "@mangabaclaw/fish-audio-speech@2026.8.1-beta.1",
            installPath: "/tmp/fish-audio-canonical",
          },
        },
      },
    } satisfies MangabaClawConfig;

    const result = await updatePlugin(config, "fish-audio");

    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expect(result.config).toBe(config);
    expect(result.config.plugins?.installs).toEqual(config.plugins?.installs);
    expect(result.outcomes).toEqual([
      {
        pluginId: "fish-audio",
        status: "error",
        message:
          'Cannot replace "fish-audio" with "fish-audio-speech" because both plugin install records exist. Remove one of the conflicting installs, then retry the update.',
      },
    ]);
  });

  it("preserves a canonical official exact pin during a targeted beta update", async () => {
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "acpx",
        targetDir: "/tmp/acpx",
        version: "2026.7.2",
      }),
    );

    await updatePlugin(
      createNpmInstallConfig({
        pluginId: "acpx",
        spec: "@mangabaclaw/acpx@2026.7.2",
        resolvedName: "@mangabaclaw/acpx",
        installPath: "/tmp/acpx",
      }),
      "acpx",
      { dryRun: true, officialPluginUpdateChannel: "beta" },
    );

    expectNpmUpdateCall({
      spec: "@mangabaclaw/acpx@2026.7.2",
      expectedPluginId: "acpx",
    });
  });

  it("keeps authored plugin config shape when only the install key migrates", async () => {
    installPluginFromNpmSpecMock.mockResolvedValue({
      ok: true,
      pluginId: "@mangabaclaw/voice-call",
      targetDir: "/tmp/mangabaclaw-voice-call",
      version: "0.0.2",
      extensions: ["index.ts"],
    });

    const result = await updateNpmInstalledPlugins({
      config: {
        plugins: {
          installs: {
            "voice-call": {
              source: "npm",
              spec: "@mangabaclaw/voice-call",
              installPath: "/tmp/voice-call",
            },
          },
        },
      },
      pluginIds: ["voice-call"],
    });

    expect(result.config.plugins).toEqual({
      installs: {
        "@mangabaclaw/voice-call": expect.objectContaining({
          source: "npm",
          spec: "@mangabaclaw/voice-call",
          installPath: "/tmp/mangabaclaw-voice-call",
        }),
      },
    });
  });

  it("migrates context engine slot when a plugin id changes during update", async () => {
    installPluginFromNpmSpecMock.mockResolvedValue({
      ok: true,
      pluginId: "@mangabaclaw/context-engine",
      targetDir: "/tmp/mangabaclaw-context-engine",
      version: "0.0.2",
      extensions: ["index.ts"],
    });

    const result = await updateNpmInstalledPlugins({
      config: {
        plugins: {
          slots: { contextEngine: "context-engine" },
          installs: {
            "context-engine": {
              source: "npm",
              spec: "@mangabaclaw/context-engine",
              installPath: "/tmp/context-engine",
            },
          },
        },
      } as MangabaClawConfig,
      pluginIds: ["context-engine"],
    });

    expect(result.config.plugins?.slots?.contextEngine).toBe("@mangabaclaw/context-engine");
    expectRecordFields(result.config.plugins?.installs?.["@mangabaclaw/context-engine"], {
      source: "npm",
      spec: "@mangabaclaw/context-engine",
      installPath: "/tmp/mangabaclaw-context-engine",
      version: "0.0.2",
    });
    expect(result.config.plugins?.installs?.["context-engine"]).toBeUndefined();
  });

  it("checks marketplace installs during dry-run updates", async () => {
    installPluginFromMarketplaceMock.mockResolvedValue({
      ok: true,
      pluginId: "claude-bundle",
      targetDir: "/tmp/claude-bundle",
      version: "1.2.0",
      extensions: ["index.ts"],
      marketplaceSource: "vincentkoc/claude-marketplace",
      marketplacePlugin: "claude-bundle",
    });

    const result = await updateNpmInstalledPlugins({
      config: createMarketplaceInstallConfig({
        pluginId: "claude-bundle",
        installPath: "/tmp/claude-bundle",
        marketplaceSource: "vincentkoc/claude-marketplace",
        marketplacePlugin: "claude-bundle",
      }),
      pluginIds: ["claude-bundle"],
      timeoutMs: 1_800_000,
      dryRun: true,
    });

    expect(marketplaceInstallCall()?.marketplace).toBe("vincentkoc/claude-marketplace");
    expect(marketplaceInstallCall()?.plugin).toBe("claude-bundle");
    expect(marketplaceInstallCall()?.expectedPluginId).toBe("claude-bundle");
    expect(marketplaceInstallCall()?.dryRun).toBe(true);
    expect(marketplaceInstallCall()?.timeoutMs).toBe(1_800_000);
    expect(result.outcomes).toEqual([
      {
        pluginId: "claude-bundle",
        status: "updated",
        currentVersion: undefined,
        nextVersion: "1.2.0",
        message: "Would update claude-bundle: unknown -> 1.2.0.",
      },
    ]);
  });

  it("updates marketplace installs and preserves source metadata", async () => {
    installPluginFromMarketplaceMock.mockResolvedValue({
      ok: true,
      pluginId: "claude-bundle",
      targetDir: "/tmp/claude-bundle",
      version: "1.3.0",
      extensions: ["index.ts"],
      marketplaceName: "Vincent's Claude Plugins",
      marketplaceSource: "vincentkoc/claude-marketplace",
      marketplacePlugin: "claude-bundle",
    });

    const result = await updateNpmInstalledPlugins({
      config: createMarketplaceInstallConfig({
        pluginId: "claude-bundle",
        installPath: "/tmp/claude-bundle",
        marketplaceName: "Vincent's Claude Plugins",
        marketplaceSource: "vincentkoc/claude-marketplace",
        marketplacePlugin: "claude-bundle",
      }),
      pluginIds: ["claude-bundle"],
    });

    expect(result.changed).toBe(true);
    expectRecordFields(result.config.plugins?.installs?.["claude-bundle"], {
      source: "marketplace",
      installPath: "/tmp/claude-bundle",
      version: "1.3.0",
      marketplaceName: "Vincent's Claude Plugins",
      marketplaceSource: "vincentkoc/claude-marketplace",
      marketplacePlugin: "claude-bundle",
    });
  });

  it("updates git installs and records resolved commit metadata", async () => {
    installPluginFromGitSpecMock.mockResolvedValue({
      ok: true,
      pluginId: "demo",
      targetDir: "/tmp/demo",
      version: "1.3.0",
      extensions: ["index.ts"],
      git: {
        url: "https://github.com/acme/demo.git",
        ref: "main",
        commit: "def456",
        resolvedAt: "2026-04-30T00:00:00.000Z",
      },
    });

    const result = await updatePlugin(
      createGitInstallConfig({
        pluginId: "demo",
        installPath: "/tmp/demo",
        spec: "git:github.com/acme/demo@main",
        commit: "abc123",
      }),
      "demo",
    );

    expect(gitInstallCall()?.spec).toBe("git:github.com/acme/demo@main");
    expect(gitInstallCall()?.expectedPluginId).toBe("demo");
    expect(gitInstallCall()?.mode).toBe("update");
    expect(result.changed).toBe(true);
    expectRecordFields(result.config.plugins?.installs?.demo, {
      source: "git",
      spec: "git:github.com/acme/demo@main",
      installPath: "/tmp/demo",
      version: "1.3.0",
      gitUrl: "https://github.com/acme/demo.git",
      gitRef: "main",
      gitCommit: "def456",
    });
  });

  it("forwards dangerous force unsafe install to plugin update installers", async () => {
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "mangabaclaw-codex-app-server",
        targetDir: "/tmp/mangabaclaw-codex-app-server",
        version: "0.2.0-beta.4",
      }),
    );

    await updatePlugin(
      createCodexAppServerInstallConfig({
        spec: "mangabaclaw-codex-app-server@beta",
      }),
      "mangabaclaw-codex-app-server",
      { dangerouslyForceUnsafeInstall: true },
    );

    expect(npmInstallCall()?.spec).toBe("mangabaclaw-codex-app-server@beta");
    expect(npmInstallCall()?.dangerouslyForceUnsafeInstall).toBe(true);
    expect(npmInstallCall()?.expectedPluginId).toBe("mangabaclaw-codex-app-server");
  });

  it("reuses the recorded managed extensions root when updating external plugins", async () => {
    const installPath = "/var/mangabaclaw/extensions/demo";
    const extensionsDir = "/var/mangabaclaw/extensions";
    const expectedExtensionsDir = path.resolve(extensionsDir);
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "demo",
        targetDir: installPath,
        version: "1.2.0",
      }),
    );
    installPluginFromClawHubMock.mockResolvedValue({
      ok: true,
      pluginId: "demo",
      targetDir: installPath,
      version: "1.2.0",
      extensions: ["index.ts"],
      clawhub: {
        source: "clawhub",
        clawhubUrl: "https://clawhub.ai",
        clawhubPackage: "demo",
        clawhubFamily: "code-plugin",
        clawhubChannel: "official",
        integrity: "sha256-next",
        resolvedAt: "2026-03-22T00:00:00.000Z",
      },
    });
    installPluginFromMarketplaceMock.mockResolvedValue({
      ok: true,
      pluginId: "demo",
      targetDir: installPath,
      version: "1.2.0",
      extensions: ["index.ts"],
      marketplaceSource: "acme/plugins",
      marketplacePlugin: "demo",
    });
    installPluginFromGitSpecMock.mockResolvedValue({
      ok: true,
      pluginId: "demo",
      targetDir: installPath,
      version: "1.2.0",
      extensions: ["index.ts"],
      git: {
        url: "https://github.com/acme/demo.git",
        ref: "main",
        commit: "abc123",
        resolvedAt: "2026-04-30T00:00:00.000Z",
      },
    });

    await updatePlugin(
      createNpmInstallConfig({
        pluginId: "demo",
        spec: "@acme/demo",
        installPath,
      }),
      "demo",
    );
    await updatePlugin(createClawHubInstallConfig({ installPath }), "demo");
    await updatePlugin(
      createMarketplaceInstallConfig({
        pluginId: "demo",
        installPath,
        marketplaceSource: "acme/plugins",
        marketplacePlugin: "demo",
      }),
      "demo",
    );
    await updatePlugin(
      createGitInstallConfig({
        pluginId: "demo",
        installPath,
        spec: "git:github.com/acme/demo@main",
      }),
      "demo",
    );

    expect(npmInstallCall()?.extensionsDir).toBe(expectedExtensionsDir);
    expect(clawHubInstallCall()?.extensionsDir).toBe(expectedExtensionsDir);
    expect(marketplaceInstallCall()?.extensionsDir).toBe(expectedExtensionsDir);
    expect(gitInstallCall()?.extensionsDir).toBe(expectedExtensionsDir);
  });
});

describe("syncPluginsForUpdateChannel", () => {
  beforeEach(() => {
    installPluginFromNpmSpecMock.mockReset();
    installPluginFromClawHubMock.mockReset();
    installPluginFromGitSpecMock.mockReset();
    resolveBundledPluginSourcesMock.mockReset();
  });

  it.each([
    {
      name: "keeps bundled path installs on beta without reinstalling from npm",
      config: createBundledPathInstallConfig({
        loadPaths: [appBundledPluginRoot("feishu")],
        installPath: appBundledPluginRoot("feishu"),
        spec: "@mangabaclaw/feishu",
      }),
      expectedChanged: false,
      expectedLoadPaths: [appBundledPluginRoot("feishu")],
      expectedInstallPath: appBundledPluginRoot("feishu"),
    },
    {
      name: "repairs bundled install metadata when the load path is re-added",
      config: createBundledPathInstallConfig({
        loadPaths: [],
        installPath: "/tmp/old-feishu",
        spec: "@mangabaclaw/feishu",
      }),
      expectedChanged: true,
      expectedLoadPaths: [appBundledPluginRoot("feishu")],
      expectedInstallPath: appBundledPluginRoot("feishu"),
    },
  ] as const)(
    "$name",
    async ({ config, expectedChanged, expectedLoadPaths, expectedInstallPath }) => {
      mockBundledSources(createBundledSource());

      const result = await syncPluginsForUpdateChannel({
        channel: "beta",
        config,
      });

      expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
      expect(result.changed).toBe(expectedChanged);
      expect(result.summary.switchedToNpm).toStrictEqual([]);
      expect(result.config.plugins?.load?.paths).toEqual(expectedLoadPaths);
      expectBundledPathInstall({
        install: result.config.plugins?.installs?.feishu,
        sourcePath: appBundledPluginRoot("feishu"),
        installPath: expectedInstallPath,
        spec: "@mangabaclaw/feishu",
      });
    },
  );

  it("forwards an explicit env to bundled plugin source resolution", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    const env = { MANGABACLAW_HOME: "/srv/mangabaclaw-home" } as NodeJS.ProcessEnv;

    await syncPluginsForUpdateChannel({
      channel: "beta",
      config: {},
      workspaceDir: "/workspace",
      env,
    });

    expect(resolveBundledPluginSourcesMock).toHaveBeenCalledWith({
      workspaceDir: "/workspace",
      env,
    });
  });

  it("uses the provided env when matching bundled load and install paths", async () => {
    const bundledHome = "/tmp/mangabaclaw-home";
    mockBundledSources(
      createBundledSource({
        localPath: `${bundledHome}/plugins/feishu`,
      }),
    );

    await withEnvAsync({ HOME: "/tmp/process-home" }, async () => {
      const result = await syncPluginsForUpdateChannel({
        channel: "beta",
        env: {
          ...process.env,
          MANGABACLAW_HOME: bundledHome,
          HOME: "/tmp/ignored-home",
        },
        config: {
          plugins: {
            load: { paths: ["~/plugins/feishu"] },
            installs: {
              feishu: {
                source: "path",
                sourcePath: "~/plugins/feishu",
                installPath: "~/plugins/feishu",
                spec: "@mangabaclaw/feishu",
              },
            },
          },
        },
      });

      expect(result.changed).toBe(false);
      expect(result.config.plugins?.load?.paths).toEqual(["~/plugins/feishu"]);
      expectBundledPathInstall({
        install: result.config.plugins?.installs?.feishu,
        sourcePath: "~/plugins/feishu",
        installPath: "~/plugins/feishu",
      });
    });
  });

  it("installs an externalized bundled plugin and rewrites its old bundled path plugin index", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "legacy-chat",
        targetDir: "/tmp/mangabaclaw-plugins/legacy-chat",
        version: "2.0.0",
        npmResolution: {
          name: "@mangabaclaw/legacy-chat",
          version: "2.0.0",
          resolvedSpec: "@mangabaclaw/legacy-chat@2.0.0",
        },
      }),
    );

    const result = await syncExternalizedPlugin({});

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/legacy-chat");
    expect(npmInstallCall()?.mode).toBe("update");
    expect(npmInstallCall()?.expectedPluginId).toBe("legacy-chat");
    expect(npmInstallCall()?.trustedSourceLinkedOfficialInstall).not.toBe(true);
    expect(result.changed).toBe(true);
    expect(result.summary.switchedToNpm).toEqual(["legacy-chat"]);
    expect(result.summary.errors).toStrictEqual([]);
    expect(result.config.plugins?.load?.paths).toStrictEqual([]);
    expectRecordFields(result.config.plugins?.installs?.["legacy-chat"], {
      source: "npm",
      spec: "@mangabaclaw/legacy-chat",
      installPath: "/tmp/mangabaclaw-plugins/legacy-chat",
      version: "2.0.0",
      resolvedName: "@mangabaclaw/legacy-chat",
      resolvedVersion: "2.0.0",
      resolvedSpec: "@mangabaclaw/legacy-chat@2.0.0",
    });
  });

  it("installs an externalized bundled plugin under its renamed package id", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "mangabaclaw-qqbot",
        targetDir: "/tmp/mangabaclaw-plugins/mangabaclaw-qqbot",
        version: "2.0.1",
      }),
    );

    const result = await syncPluginsForUpdateChannel({
      channel: "stable",
      externalizedBundledPluginBridges: [
        {
          bundledPluginId: "qqbot",
          pluginId: "mangabaclaw-qqbot",
          npmSpec: "@tencent-connect/mangabaclaw-qqbot@2.0.1",
          expectedIntegrity: "sha512-qqbot-catalog-pin",
          channelIds: ["qqbot"],
        },
      ],
      config: {
        channels: { qqbot: { enabled: true } },
        plugins: {
          entries: { qqbot: { enabled: true } },
          load: { paths: [appBundledPluginRoot("qqbot")] },
          installs: {
            qqbot: {
              source: "path",
              sourcePath: appBundledPluginRoot("qqbot"),
              installPath: appBundledPluginRoot("qqbot"),
            },
          },
        },
      },
    });

    expect(npmInstallCall()?.expectedPluginId).toBe("mangabaclaw-qqbot");
    expect(npmInstallCall()?.expectedIntegrity).toBe("sha512-qqbot-catalog-pin");
    expect(result.summary.switchedToNpm).toEqual(["mangabaclaw-qqbot"]);
    expect(result.config.plugins?.entries?.qqbot).toBeUndefined();
    expect(result.config.plugins?.entries?.["mangabaclaw-qqbot"]).toEqual({ enabled: true });
    expect(result.config.plugins?.installs?.qqbot).toBeUndefined();
    expectRecordFields(result.config.plugins?.installs?.["mangabaclaw-qqbot"], {
      source: "npm",
      spec: "@tencent-connect/mangabaclaw-qqbot@2.0.1",
      installPath: "/tmp/mangabaclaw-plugins/mangabaclaw-qqbot",
      version: "2.0.1",
    });
  });

  it("marks official externalized bundled npm installs as trusted", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "voice-call",
        targetDir: "/tmp/mangabaclaw-plugins/voice-call",
        version: "0.0.2-beta.1",
      }),
    );

    await syncExternalizedPlugin({
      bridge: {
        bundledPluginId: "voice-call",
        npmSpec: "@mangabaclaw/voice-call",
        channelIds: ["voice-call"],
      },
      config: createExternalizedPluginConfig({ pluginId: "voice-call" }),
    });

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/voice-call");
    expect(npmInstallCall()?.expectedPluginId).toBe("voice-call");
    expect(npmInstallCall()?.trustedSourceLinkedOfficialInstall).toBe(true);
  });

  it("installs a ClawHub-preferred externalized bundled plugin", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    installPluginFromClawHubMock.mockResolvedValue(
      createSuccessfulClawHubUpdateResult({
        pluginId: "legacy-chat",
        targetDir: "/tmp/mangabaclaw-plugins/legacy-chat",
        version: "2026.5.1-beta.2",
        clawhubPackage: "legacy-chat",
      }),
    );
    const onClawHubRisk = vi.fn(async () => true);

    const result = await syncExternalizedPlugin({
      acknowledgeClawHubRisk: true,
      onClawHubRisk,
      bridge: {
        preferredSource: "clawhub",
        clawhubSpec: "clawhub:legacy-chat@2026.5.1-beta.2",
        clawhubUrl: "https://clawhub.ai",
      },
    });

    expect(clawHubInstallCall()?.spec).toBe("clawhub:legacy-chat@2026.5.1-beta.2");
    expect(clawHubInstallCall()?.baseUrl).toBe("https://clawhub.ai");
    expect(clawHubInstallCall()?.mode).toBe("update");
    expect(clawHubInstallCall()?.expectedPluginId).toBe("legacy-chat");
    expect(clawHubInstallCall()?.acknowledgeClawHubRisk).toBe(true);
    expect(clawHubInstallCall()?.onClawHubRisk).toBe(onClawHubRisk);
    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(true);
    expect(result.summary.switchedToClawHub).toEqual(["legacy-chat"]);
    expect(result.summary.switchedToNpm).toStrictEqual([]);
    expect(result.summary.errors).toStrictEqual([]);
    expect(result.config.plugins?.load?.paths).toStrictEqual([]);
    expectRecordFields(result.config.plugins?.installs?.["legacy-chat"], {
      source: "clawhub",
      spec: "clawhub:legacy-chat@2026.5.1-beta.2",
      installPath: "/tmp/mangabaclaw-plugins/legacy-chat",
      version: "2026.5.1-beta.2",
      integrity: "sha256-clawpack",
      clawhubUrl: "https://clawhub.ai",
      clawhubPackage: "legacy-chat",
      clawhubFamily: "code-plugin",
      clawhubChannel: "official",
      artifactKind: "npm-pack",
      artifactFormat: "tgz",
      npmIntegrity: "sha512-clawpack",
      npmShasum: "2".repeat(40),
      npmTarballName: "legacy-chat-2026.5.1-beta.2.tgz",
      clawpackSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      clawpackSpecVersion: 1,
      clawpackManifestSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      clawpackSize: 4096,
    });
  });

  it("falls back from ClawHub to npm only when the ClawHub package is absent", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    installPluginFromClawHubMock.mockResolvedValue({
      ok: false,
      code: "package_not_found",
      error: "Package not found on ClawHub.",
    });
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "legacy-chat",
        targetDir: "/tmp/mangabaclaw-plugins/legacy-chat",
        version: "2.0.0",
      }),
    );

    const result = await syncExternalizedPlugin({
      bridge: {
        preferredSource: "clawhub",
        clawhubSpec: "clawhub:legacy-chat@2026.5.1-beta.2",
      },
    });

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/legacy-chat");
    expect(npmInstallCall()?.mode).toBe("update");
    expect(npmInstallCall()?.expectedPluginId).toBe("legacy-chat");
    expect(npmInstallCall()?.trustedSourceLinkedOfficialInstall).not.toBe(true);
    expect(result.changed).toBe(true);
    expect(result.summary.switchedToClawHub).toStrictEqual([]);
    expect(result.summary.switchedToNpm).toEqual(["legacy-chat"]);
    expect(result.summary.warnings).toEqual([
      "ClawHub clawhub:legacy-chat@2026.5.1-beta.2 unavailable for legacy-chat; falling back to npm @mangabaclaw/legacy-chat.",
    ]);
    expect(result.summary.errors).toStrictEqual([]);
    expectRecordFields(result.config.plugins?.installs?.["legacy-chat"], {
      source: "npm",
      spec: "@mangabaclaw/legacy-chat",
      installPath: "/tmp/mangabaclaw-plugins/legacy-chat",
      version: "2.0.0",
    });
  });

  it("uses exact-core npm when an official ClawHub bridge falls back on extended-stable", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    installPluginFromClawHubMock.mockResolvedValue({
      ok: false,
      code: "package_not_found",
      error: "Package not found on ClawHub.",
    });
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "voice-call",
        targetDir: "/tmp/mangabaclaw-plugins/voice-call",
        version: "2026.7.33",
        npmResolution: {
          name: "@mangabaclaw/voice-call",
          version: "2026.7.33",
          resolvedSpec: "@mangabaclaw/voice-call@2026.7.33",
        },
      }),
    );

    const result = await syncExternalizedPlugin({
      channel: "extended-stable",
      coreVersion: "2026.7.33",
      bridge: {
        bundledPluginId: "voice-call",
        preferredSource: "clawhub",
        clawhubSpec: "clawhub:@mangabaclaw/voice-call",
        npmSpec: "@mangabaclaw/voice-call",
        channelIds: ["voice-call"],
      },
      config: createExternalizedPluginConfig({ pluginId: "voice-call", includeLoad: false }),
    });

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/voice-call@2026.7.33");
    expect(npmInstallCall()?.trustedSourceLinkedOfficialInstall).toBe(true);
    expectRecordFields(result.config.plugins?.installs?.["voice-call"], {
      source: "npm",
      spec: "@mangabaclaw/voice-call",
      version: "2026.7.33",
      resolvedSpec: "@mangabaclaw/voice-call@2026.7.33",
    });
  });

  it("does not fall back from ClawHub to non-MangabaClaw npm packages", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    installPluginFromClawHubMock.mockResolvedValue({
      ok: false,
      code: "package_not_found",
      error: "Package not found on ClawHub.",
    });
    const config = createExternalizedPluginConfig();

    const result = await syncExternalizedPlugin({
      bridge: {
        preferredSource: "clawhub",
        clawhubSpec: "clawhub:legacy-chat@2026.5.1-beta.2",
        npmSpec: "@someone-else/legacy-chat",
      },
      config,
    });

    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expect(result.config).toBe(config);
    expect(result.summary.switchedToNpm).toStrictEqual([]);
    expect(result.summary.warnings).toStrictEqual([]);
    expect(result.summary.errors).toEqual([
      "Failed to update legacy-chat: Package not found on ClawHub. (ClawHub clawhub:legacy-chat@2026.5.1-beta.2).",
    ]);
  });

  it("falls back from official ClawHub artifact misses to trusted npm packages", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    installPluginFromClawHubMock.mockResolvedValue({
      ok: false,
      code: "artifact_download_unavailable",
      error: "ClawHub ClawPack artifact is unavailable.",
    });
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "voice-call",
        targetDir: "/tmp/mangabaclaw-plugins/voice-call",
        version: "0.0.2-beta.1",
      }),
    );

    await syncExternalizedPlugin({
      bridge: {
        bundledPluginId: "voice-call",
        preferredSource: "clawhub",
        clawhubSpec: "clawhub:@mangabaclaw/voice-call",
        npmSpec: "@mangabaclaw/voice-call",
        channelIds: ["voice-call"],
      },
      config: createExternalizedPluginConfig({ pluginId: "voice-call" }),
    });

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/voice-call");
    expect(npmInstallCall()?.expectedPluginId).toBe("voice-call");
    expect(npmInstallCall()?.trustedSourceLinkedOfficialInstall).toBe(true);
  });

  it("moves ClawHub-preferred externalized plugin fallbacks back to ClawHub", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    installPluginFromClawHubMock.mockResolvedValue(
      createSuccessfulClawHubUpdateResult({
        pluginId: "legacy-chat",
        targetDir: "/tmp/mangabaclaw-plugins/legacy-chat",
        version: "2026.5.1-beta.2",
        clawhubPackage: "legacy-chat",
      }),
    );

    const result = await syncExternalizedPlugin({
      bridge: {
        preferredSource: "clawhub",
        clawhubSpec: "clawhub:legacy-chat@2026.5.1-beta.2",
      },
      config: createExternalizedPluginConfig({
        includeLoad: false,
        install: {
          source: "npm",
          spec: "@mangabaclaw/legacy-chat",
          installPath: "/tmp/mangabaclaw-plugins/legacy-chat",
        },
      }),
    });

    expect(clawHubInstallCall()?.spec).toBe("clawhub:legacy-chat@2026.5.1-beta.2");
    expect(clawHubInstallCall()?.mode).toBe("update");
    expect(clawHubInstallCall()?.expectedPluginId).toBe("legacy-chat");
    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(true);
    expect(result.summary.switchedToClawHub).toEqual(["legacy-chat"]);
    expectRecordFields(result.config.plugins?.installs?.["legacy-chat"], {
      source: "clawhub",
      spec: "clawhub:legacy-chat@2026.5.1-beta.2",
      installPath: "/tmp/mangabaclaw-plugins/legacy-chat",
    });
  });

  it("fails closed without npm fallback when ClawHub returns integrity drift", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    installPluginFromClawHubMock.mockResolvedValue({
      ok: false,
      code: "archive_integrity_mismatch",
      error: "ClawHub ClawPack integrity mismatch.",
      warning: "WARNING\nSecurity scan: suspicious",
    });
    const config = createExternalizedPluginConfig();

    const result = await syncExternalizedPlugin({
      bridge: {
        preferredSource: "clawhub",
        clawhubSpec: "clawhub:legacy-chat@2026.5.1-beta.2",
      },
      config,
    });

    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expect(result.config).toBe(config);
    expect(result.summary.warnings).toEqual(["WARNING\nSecurity scan: suspicious"]);
    expect(result.summary.errors).toEqual([
      "Failed to update legacy-chat: ClawHub ClawPack integrity mismatch. (ClawHub clawhub:legacy-chat@2026.5.1-beta.2).",
    ]);
  });

  it("externalizes bundled plugins that were enabled by default", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    installPluginFromNpmSpecMock.mockResolvedValue(
      createSuccessfulNpmUpdateResult({
        pluginId: "default-chat",
        targetDir: "/tmp/mangabaclaw-plugins/default-chat",
        version: "2.0.0",
      }),
    );

    const result = await syncPluginsForUpdateChannel({
      channel: "stable",
      externalizedBundledPluginBridges: [
        {
          bundledPluginId: "default-chat",
          enabledByDefault: true,
          npmSpec: "@mangabaclaw/default-chat",
          channelIds: ["default-chat"],
        },
      ],
      config: {},
    });

    expect(npmInstallCall()?.spec).toBe("@mangabaclaw/default-chat");
    expect(npmInstallCall()?.mode).toBe("update");
    expect(npmInstallCall()?.expectedPluginId).toBe("default-chat");
    expect(result.changed).toBe(true);
    expect(result.summary.switchedToNpm).toEqual(["default-chat"]);
    expectRecordFields(result.config.plugins?.installs?.["default-chat"], {
      source: "npm",
      spec: "@mangabaclaw/default-chat",
      installPath: "/tmp/mangabaclaw-plugins/default-chat",
      version: "2.0.0",
    });
  });

  it("does not externalize disabled bundled plugins", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());

    const result = await syncExternalizedPlugin({
      config: createExternalizedPluginConfig({
        channelEnabled: false,
        entryEnabled: false,
      }),
    });

    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expectRecordFields(result.config.plugins?.installs?.["legacy-chat"], {
      source: "path",
    });
  });

  it("leaves config unchanged when externalized plugin installation fails", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());
    installPluginFromNpmSpecMock.mockResolvedValue({
      ok: false,
      error: "package unavailable",
    });
    const config = createExternalizedPluginConfig();

    const result = await syncExternalizedPlugin({ config });

    expect(result.changed).toBe(false);
    expect(result.config).toBe(config);
    expect(result.summary.errors).toEqual(["Failed to update legacy-chat: package unavailable"]);
  });

  it("does not externalize custom local path installs that only share the old plugin id", async () => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());

    const result = await syncExternalizedPlugin({
      config: createExternalizedPluginConfig({
        loadPaths: ["/workspace/plugins/legacy-chat"],
        install: {
          source: "path",
          sourcePath: "/workspace/plugins/legacy-chat",
          installPath: "/workspace/plugins/legacy-chat",
        },
      }),
    });

    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expectRecordFields(result.config.plugins?.installs?.["legacy-chat"], {
      source: "path",
      sourcePath: "/workspace/plugins/legacy-chat",
    });
  });

  it("does not externalize while the bundled source is still present in the current build", async () => {
    mockBundledSources(
      createBundledSource({
        pluginId: "legacy-chat",
        localPath: appBundledPluginRoot("legacy-chat"),
      }),
    );

    const result = await syncExternalizedPlugin({});

    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expectRecordFields(result.config.plugins?.installs?.["legacy-chat"], {
      source: "path",
    });
  });

  it.each(["constructor", "__proto__"])(
    "migrates already-externalized records to prototype-named plugin id %s",
    async (targetPluginId) => {
      const legacyPluginId = `legacy-${targetPluginId}`;
      const npmPackageName = `mangabaclaw-plugin-${targetPluginId}`;
      resolveBundledPluginSourcesMock.mockReturnValue(new Map());

      const result = await syncPluginsForUpdateChannel({
        channel: "stable",
        externalizedBundledPluginBridges: [
          {
            bundledPluginId: legacyPluginId,
            pluginId: targetPluginId,
            npmSpec: npmPackageName,
            channelIds: [],
          },
        ],
        config: {
          plugins: {
            entries: {
              [legacyPluginId]: { enabled: true },
            },
            installs: {
              [legacyPluginId]: {
                source: "npm",
                spec: npmPackageName,
                installPath: `/tmp/${targetPluginId}`,
              },
            },
          },
        },
      });

      expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
      expect(result.changed).toBe(true);
      expect(Object.hasOwn(result.config.plugins?.entries ?? {}, targetPluginId)).toBe(true);
      expect(Object.getPrototypeOf(result.config.plugins?.entries ?? {})).toBe(Object.prototype);
      expect(result.config.plugins?.entries?.[targetPluginId]).toEqual({ enabled: true });
      expect(Object.hasOwn(result.config.plugins?.installs ?? {}, targetPluginId)).toBe(true);
      expect(Object.getPrototypeOf(result.config.plugins?.installs ?? {})).toBe(Object.prototype);
      expectRecordFields(result.config.plugins?.installs?.[targetPluginId], {
        source: "npm",
        spec: npmPackageName,
        installPath: `/tmp/${targetPluginId}`,
      });
      expect(result.config.plugins?.entries?.[legacyPluginId]).toBeUndefined();
      expect(result.config.plugins?.installs?.[legacyPluginId]).toBeUndefined();
    },
  );

  it.each([
    {
      name: "removes stale bundled load paths for already-externalized npm installs",
      install: {
        source: "npm",
        spec: "@mangabaclaw/legacy-chat",
        installPath: "/tmp/mangabaclaw-plugins/legacy-chat",
      },
      expectedInstall: { source: "npm", spec: "@mangabaclaw/legacy-chat" },
      bridge: {},
      expectClawHubNotCalled: false,
    },
    {
      name: "removes stale bundled load paths for already-externalized resolved-name-only npm installs",
      install: {
        source: "npm",
        resolvedName: "@mangabaclaw/legacy-chat",
        installPath: "/tmp/mangabaclaw-plugins/legacy-chat",
      },
      expectedInstall: { source: "npm", resolvedName: "@mangabaclaw/legacy-chat" },
      bridge: {},
      expectClawHubNotCalled: false,
    },
    {
      name: "removes stale bundled load paths for already-externalized pinned npm installs",
      install: {
        source: "npm",
        spec: "@mangabaclaw/legacy-chat@1.2.3",
        resolvedSpec: "@mangabaclaw/legacy-chat@1.2.3",
        installPath: "/tmp/mangabaclaw-plugins/legacy-chat",
      },
      expectedInstall: { source: "npm", spec: "@mangabaclaw/legacy-chat@1.2.3" },
      bridge: {},
      expectClawHubNotCalled: false,
    },
    {
      name: "removes stale bundled load paths for already-externalized pinned ClawHub installs",
      install: {
        source: "clawhub",
        spec: "clawhub:legacy-chat@2026.5.1",
        clawhubPackage: "legacy-chat",
        installPath: "/tmp/mangabaclaw-plugins/legacy-chat",
      },
      expectedInstall: { source: "clawhub", spec: "clawhub:legacy-chat@2026.5.1" },
      bridge: { preferredSource: "clawhub", clawhubSpec: "clawhub:legacy-chat" },
      expectClawHubNotCalled: true,
    },
  ] as const)("$name", async ({ install, expectedInstall, bridge, expectClawHubNotCalled }) => {
    resolveBundledPluginSourcesMock.mockReturnValue(new Map());

    const result = await syncExternalizedPlugin({
      bridge,
      config: createExternalizedPluginConfig({
        loadPaths: [appBundledPluginRoot("legacy-chat"), "/workspace/plugins/other"],
        install,
      }),
    });

    if (expectClawHubNotCalled) {
      expect(installPluginFromClawHubMock).not.toHaveBeenCalled();
    }
    expect(installPluginFromNpmSpecMock).not.toHaveBeenCalled();
    expect(result.changed).toBe(true);
    expect(result.config.plugins?.load?.paths).toEqual(["/workspace/plugins/other"]);
    expectRecordFields(result.config.plugins?.installs?.["legacy-chat"], expectedInstall);
  });
});
/* oxlint-disable max-lines -- TODO: split this grandfathered oversized file. */
