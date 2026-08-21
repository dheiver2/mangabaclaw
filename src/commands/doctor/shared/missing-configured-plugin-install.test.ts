// Missing configured plugin install tests cover doctor diagnostics for absent plugin installs.
import fs from "node:fs";
import path from "node:path";
import { expectDefined } from "@mangabaclaw/normalization-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../../test/helpers/temp-dir.js";
import type { MangabaClawConfig, PluginsConfig } from "../../../config/types.js";
import { resolveRegistryUpdateChannel } from "../../../infra/update-channels.js";
import { CLAWHUB_INSTALL_ERROR_CODE } from "../../../plugins/clawhub-error-codes.js";
import {
  resolveClawHubInstallSpecsForUpdateChannel,
  resolveNpmInstallSpecsForUpdateChannel,
} from "../../../plugins/install-channel-specs.js";
import { resolveInstalledPluginIndexPolicyHash } from "../../../plugins/installed-plugin-index-policy.js";
import type { BundledProviderPolicySurface } from "../../../plugins/provider-policy-surface.js";
import { VERSION } from "../../../version.js";
import { applyLegacyDoctorMigrations } from "./legacy-config-compat.js";
import {
  brokenPluginSnapshot,
  channelPluginEntry,
  installedRecords,
  officialPluginEntry,
  officialWebSearchPluginEntry,
  successfulInstall,
  successfulUpdate,
} from "./missing-configured-plugin-install.test-helpers.js";

function expectedNpmInstallSpec(spec: string): string {
  return resolveNpmInstallSpecsForUpdateChannel({
    spec,
    updateChannel: resolveRegistryUpdateChannel({ currentVersion: VERSION }),
  }).installSpec;
}

function expectedClawHubInstallSpec(spec: string): string {
  return resolveClawHubInstallSpecsForUpdateChannel({
    spec,
    updateChannel: resolveRegistryUpdateChannel({ currentVersion: VERSION }),
  }).installSpec;
}

function expectedCodexInstallSpec(): string {
  return resolveNpmInstallSpecsForUpdateChannel({
    spec: "@mangabaclaw/codex",
    updateChannel: resolveRegistryUpdateChannel({ currentVersion: VERSION }),
    officialPackageName: "@mangabaclaw/codex",
    coreVersion: VERSION,
    versionBoundToCore: true,
  }).installSpec;
}

function currentMangabaClawReleaseBase(): string {
  return VERSION.replace(/-(?:alpha|beta)\.[1-9]\d*$/u, "");
}

function expectRecordFields(record: unknown, expected: Record<string, unknown>) {
  if (!record || typeof record !== "object") {
    throw new Error("Expected record");
  }
  const actual = record as Record<string, unknown>;
  for (const [key, value] of Object.entries(expected)) {
    expect(actual[key]).toEqual(value);
  }
  return actual;
}

function mockCallArg(mock: ReturnType<typeof vi.fn>, callIndex = 0, argIndex = 0) {
  const call = mock.mock.calls[callIndex];
  if (!call) {
    throw new Error(`Expected mock call ${callIndex}`);
  }
  return call[argIndex];
}

const mocks = vi.hoisted(() => ({
  installPluginFromClawHub: vi.fn(),
  installPluginFromNpmSpec: vi.fn(),
  listChannelPluginCatalogEntries: vi.fn(),
  listOfficialExternalChannelEnvVars: vi.fn(() => []),
  listOfficialExternalPluginCatalogEntries: vi.fn(),
  loadInstalledPluginIndex: vi.fn(),
  loadInstalledPluginIndexInstallRecords: vi.fn(),
  loadPluginMetadataSnapshot: vi.fn(),
  getOfficialExternalPluginCatalogManifest: vi.fn(
    (entry: { mangabaclaw?: unknown }) => entry.mangabaclaw,
  ),
  resolveOfficialExternalPluginId: vi.fn((entry: { id?: string }) => entry.id),
  resolveOfficialExternalPluginInstall: vi.fn(
    (entry: { install?: unknown }) => entry.install ?? null,
  ),
  resolveOfficialExternalPluginLabel: vi.fn(
    (entry: { label?: string; id?: string }) => entry.label ?? entry.id ?? "plugin",
  ),
  resolveOfficialExternalProviderContractPluginIds: vi.fn(),
  resolveOfficialExternalProviderPluginIds: vi.fn(),
  resolveOfficialExternalProviderPluginIdsForEnv: vi.fn(),
  resolveOfficialExternalWebProviderContractPluginIdsForEnv: vi.fn(),
  resolveDirectBundledProviderPolicySurface: vi.fn(
    (pluginId: string): BundledProviderPolicySurface | null =>
      pluginId === "openai"
        ? {
            normalizeModelCatalogId: ({ modelId }) => modelId,
            resolveModelRoutes: ({ requestTransportOverrides }) => ({
              kind: "routes",
              routes: [
                {
                  api: "openai-responses",
                  baseUrl: "https://api.openai.com/v1",
                  authRequirement: "api-key",
                  requestTransportOverrides: requestTransportOverrides ?? "none",
                  runtimePolicy: { compatibleIds: ["mangabaclaw", "codex"] },
                },
              ],
              defaultRuntimeId: "codex",
            }),
          }
        : null,
  ),
  resolveDefaultPluginExtensionsDir: vi.fn(() => "/tmp/mangabaclaw-plugins"),
  resolveDefaultPluginNpmDir: vi.fn(() => "/tmp/mangabaclaw-npm"),
  resolvePluginNpmProjectsDir: vi.fn((npmDir = "/tmp/mangabaclaw-npm") =>
    path.join(npmDir, "projects"),
  ),
  resolvePluginNpmPackageDir: vi.fn(
    ({ npmDir, packageName }: { npmDir?: string; packageName: string }) =>
      path.join(
        npmDir ?? "/tmp/mangabaclaw-npm",
        "projects",
        packageName.replace(/[^a-zA-Z0-9._-]+/g, "-"),
        "node_modules",
        ...packageName.split("/"),
      ),
  ),
  resolvePluginInstallDir: vi.fn(
    (pluginId: string, extensionsDir = "/tmp/mangabaclaw-plugins") => `${extensionsDir}/${pluginId}`,
  ),
  validatePluginId: vi.fn(() => null),
  resolveProviderInstallCatalogEntries: vi.fn(),
  updateNpmInstalledPlugins: vi.fn(),
  writePersistedInstalledPluginIndexInstallRecords: vi.fn(),
}));

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

function mockCurrentBundledPlugin(pluginId: string, packageName: string): void {
  mocks.loadInstalledPluginIndex.mockReturnValue({
    plugins: [{ pluginId, origin: "bundled", packageName }],
    diagnostics: [],
    installRecords: {},
  });
}

function writeLegacyNpmDeclarationStub(params: {
  pluginDir: string;
  pluginId: string;
  npmSpec: string;
}): void {
  fs.mkdirSync(params.pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(params.pluginDir, "mangabaclaw.extension.json"),
    JSON.stringify({
      name: params.pluginId,
      type: "npm",
      npmSpec: params.npmSpec,
    }),
    "utf8",
  );
}

async function repairConfiguredPlugins(
  cfg: MangabaClawConfig,
  env: Record<string, string | undefined> = {},
) {
  const { repairMissingConfiguredPluginInstalls } =
    await import("./missing-configured-plugin-install.js");
  return repairMissingConfiguredPluginInstalls({ cfg, env });
}

function useManifestCatalogResolvers(): void {
  mocks.resolveOfficialExternalPluginId.mockImplementation(
    (entry: { id?: string; mangabaclaw?: { plugin?: { id?: string } } }) =>
      entry.mangabaclaw?.plugin?.id ?? entry.id,
  );
  mocks.resolveOfficialExternalPluginInstall.mockImplementation(
    (entry: { install?: unknown; mangabaclaw?: { install?: unknown } }) =>
      entry.mangabaclaw?.install ?? entry.install ?? null,
  );
  mocks.resolveOfficialExternalPluginLabel.mockImplementation(
    (entry: { label?: string; mangabaclaw?: { plugin?: { label?: string } } }) =>
      entry.mangabaclaw?.plugin?.label ?? entry.label ?? "plugin",
  );
}

function mockBrokenBraveInstall(
  installDir: string,
  recordOverrides: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const records = installedRecords("brave", {
    installPath: installDir,
    ...recordOverrides,
  });
  mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
  mocks.loadPluginMetadataSnapshot.mockReturnValue(brokenPluginSnapshot("brave"));
  mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
    officialWebSearchPluginEntry({
      id: "brave",
      npmSpec: "@mangabaclaw/brave-plugin",
      envVar: "BRAVE_API_KEY",
      label: "Brave",
      providerLabel: "Brave Search",
    }),
  ]);
  return records;
}

vi.mock("../../../channels/plugins/catalog.js", () => ({
  listRawChannelPluginCatalogEntries: mocks.listChannelPluginCatalogEntries,
}));

vi.mock("../../../plugins/installed-plugin-index-records.js", () => ({
  loadInstalledPluginIndexInstallRecords: mocks.loadInstalledPluginIndexInstallRecords,
  writePersistedInstalledPluginIndexInstallRecords:
    mocks.writePersistedInstalledPluginIndexInstallRecords,
}));

vi.mock("../../../plugins/installed-plugin-index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../plugins/installed-plugin-index.js")>()),
  loadInstalledPluginIndex: mocks.loadInstalledPluginIndex,
}));

vi.mock("../../../plugins/install-paths.js", () => ({
  resolveDefaultPluginExtensionsDir: mocks.resolveDefaultPluginExtensionsDir,
  resolveDefaultPluginNpmDir: mocks.resolveDefaultPluginNpmDir,
  resolvePluginNpmProjectsDir: mocks.resolvePluginNpmProjectsDir,
  resolvePluginNpmPackageDir: mocks.resolvePluginNpmPackageDir,
  resolvePluginInstallDir: mocks.resolvePluginInstallDir,
  validatePluginId: mocks.validatePluginId,
}));

vi.mock("../../../plugins/install.js", () => ({
  installPluginFromNpmSpec: mocks.installPluginFromNpmSpec,
}));

vi.mock("../../../plugins/clawhub.js", () => ({
  CLAWHUB_INSTALL_ERROR_CODE: {
    PACKAGE_NOT_FOUND: "package_not_found",
    VERSION_NOT_FOUND: "version_not_found",
    ARTIFACT_UNAVAILABLE: "artifact_unavailable",
    ARTIFACT_DOWNLOAD_UNAVAILABLE: "artifact_download_unavailable",
    CLAWHUB_DOWNLOAD_BLOCKED: "clawhub_download_blocked",
    CLAWHUB_SECURITY_UNAVAILABLE: "clawhub_security_unavailable",
  },
  installPluginFromClawHub: mocks.installPluginFromClawHub,
}));

vi.mock("../../../plugins/plugin-metadata-snapshot.js", () => ({
  loadPluginMetadataSnapshot: mocks.loadPluginMetadataSnapshot,
  resolvePluginMetadataSnapshot: mocks.loadPluginMetadataSnapshot,
}));

vi.mock("../../../plugins/manifest-contract-eligibility.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../plugins/manifest-contract-eligibility.js")>()),
  loadManifestMetadataSnapshot: mocks.loadPluginMetadataSnapshot,
}));

vi.mock("../../../plugins/doctor-contract-registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../plugins/doctor-contract-registry.js")>()),
  // Plugin-owned compatibility is outside this install-repair suite. Avoid scanning
  // the real plugin registry when the legacy-config fixture reaches that follow-up pass.
  applyPluginDoctorCompatibilityMigrations: (cfg: MangabaClawConfig) => ({
    config: cfg,
    changes: [],
  }),
}));

vi.mock("../../../plugins/official-external-plugin-catalog.js", () => ({
  getOfficialExternalPluginCatalogManifest: mocks.getOfficialExternalPluginCatalogManifest,
  listOfficialExternalChannelEnvVars: mocks.listOfficialExternalChannelEnvVars,
  listOfficialExternalPluginCatalogEntries: mocks.listOfficialExternalPluginCatalogEntries,
  resolveOfficialExternalPluginId: mocks.resolveOfficialExternalPluginId,
  resolveOfficialExternalPluginInstall: mocks.resolveOfficialExternalPluginInstall,
  resolveOfficialExternalPluginLabel: mocks.resolveOfficialExternalPluginLabel,
  resolveOfficialExternalProviderContractPluginIds:
    mocks.resolveOfficialExternalProviderContractPluginIds,
  resolveOfficialExternalProviderPluginIds: mocks.resolveOfficialExternalProviderPluginIds,
  resolveOfficialExternalProviderPluginIdsForEnv:
    mocks.resolveOfficialExternalProviderPluginIdsForEnv,
  resolveOfficialExternalWebProviderContractPluginIdsForEnv:
    mocks.resolveOfficialExternalWebProviderContractPluginIdsForEnv,
}));

vi.mock("../../../plugins/provider-install-catalog.js", () => ({
  resolveProviderInstallCatalogEntries: mocks.resolveProviderInstallCatalogEntries,
}));

vi.mock("../../../plugins/provider-policy-surface.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../plugins/provider-policy-surface.js")>()),
  // This suite owns install repair. Provider artifact loading and route policy
  // have dedicated tests, so keep the OpenAI runtime-selection seam in memory.
  resolveDirectBundledProviderPolicySurface: mocks.resolveDirectBundledProviderPolicySurface,
}));

vi.mock("../../../plugins/doctor-contract-registry.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../plugins/doctor-contract-registry.js")>();
  return {
    ...actual,
    // Plugin-owned compatibility discovery has its own coverage. Keep this
    // install-repair suite focused and avoid scanning every source plugin.
    applyPluginDoctorCompatibilityMigrations: (cfg: MangabaClawConfig) => ({
      config: cfg,
      changes: [],
    }),
  };
});

vi.mock("../../../plugins/update.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../plugins/update.js")>();
  return {
    ...actual,
    updateNpmInstalledPlugins: mocks.updateNpmInstalledPlugins,
  };
});

describe("repairMissingConfiguredPluginInstalls", () => {
  beforeAll(async () => {
    // The doctor module owns a broad install/catalog graph. Its cold import is
    // suite setup; individual cases measure detection and repair behavior.
    await import("./missing-configured-plugin-install.js");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [],
      diagnostics: [],
    });
    mocks.loadInstalledPluginIndex.mockReturnValue({
      plugins: [],
      diagnostics: [],
      installRecords: {},
    });
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue({});
    mocks.listChannelPluginCatalogEntries.mockReturnValue([]);
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([]);
    mocks.resolveDefaultPluginExtensionsDir.mockReturnValue("/tmp/mangabaclaw-plugins");
    mocks.resolveDefaultPluginNpmDir.mockReturnValue("/tmp/mangabaclaw-npm");
    mocks.resolveProviderInstallCatalogEntries.mockReturnValue([]);
    mocks.resolveOfficialExternalProviderPluginIdsForEnv.mockReturnValue([]);
    mocks.resolveOfficialExternalWebProviderContractPluginIdsForEnv.mockReturnValue([]);
    mocks.resolveOfficialExternalProviderContractPluginIds.mockImplementation(
      ({ contract, providerIds }: { contract: string; providerIds: ReadonlySet<string> }) => {
        const configuredProviderIds = new Set(
          [...providerIds].map((providerId) => providerId.trim().toLowerCase()),
        );
        const entries = mocks.listOfficialExternalPluginCatalogEntries.getMockImplementation()?.();
        if (!Array.isArray(entries)) {
          return [];
        }
        return entries.flatMap((entry) => {
          if (!entry || typeof entry !== "object") {
            return [];
          }
          const candidate = entry as {
            id?: string;
            mangabaclaw?: {
              plugin?: { id?: string };
              contracts?: Record<string, unknown>;
            };
          };
          const pluginId = candidate.mangabaclaw?.plugin?.id ?? candidate.id;
          const ownedProviderIds = candidate.mangabaclaw?.contracts?.[contract];
          if (
            !pluginId ||
            !Array.isArray(ownedProviderIds) ||
            !ownedProviderIds.some(
              (providerId) =>
                typeof providerId === "string" &&
                configuredProviderIds.has(providerId.trim().toLowerCase()),
            )
          ) {
            return [];
          }
          return [pluginId];
        });
      },
    );
    mocks.resolveOfficialExternalProviderPluginIds.mockImplementation(
      ({ providerIds }: { providerIds: ReadonlySet<string> }) => {
        const configuredProviderIds = new Set(
          [...providerIds].map((providerId) => providerId.trim().toLowerCase()),
        );
        const entries = mocks.listOfficialExternalPluginCatalogEntries.getMockImplementation()?.();
        if (!Array.isArray(entries)) {
          return [];
        }
        return entries.flatMap((entry) => {
          if (!entry || typeof entry !== "object") {
            return [];
          }
          const candidate = entry as {
            id?: string;
            mangabaclaw?: {
              plugin?: { id?: string };
              providers?: Array<{ id?: string; aliases?: string[] }>;
            };
          };
          const pluginId = candidate.mangabaclaw?.plugin?.id ?? candidate.id;
          const ownsConfiguredProvider = candidate.mangabaclaw?.providers?.some((provider) =>
            [provider.id, ...(provider.aliases ?? [])].some(
              (providerId) =>
                typeof providerId === "string" &&
                configuredProviderIds.has(providerId.trim().toLowerCase()),
            ),
          );
          return pluginId && ownsConfiguredProvider ? [pluginId] : [];
        });
      },
    );
    mocks.installPluginFromClawHub.mockResolvedValue({
      ok: true,
      pluginId: "matrix",
      targetDir: "/tmp/mangabaclaw-plugins/matrix",
      version: "1.2.3",
      clawhub: {
        source: "clawhub",
        clawhubUrl: "https://clawhub.ai",
        clawhubPackage: "@mangabaclaw/plugin-matrix",
        clawhubFamily: "code-plugin",
        clawhubChannel: "official",
        version: "1.2.3",
        integrity: "sha256-clawhub",
        resolvedAt: "2026-05-01T00:00:00.000Z",
        clawpackSha256: "0".repeat(64),
        clawpackSpecVersion: 1,
        clawpackManifestSha256: "1".repeat(64),
        clawpackSize: 1234,
      },
    });
    mocks.installPluginFromNpmSpec.mockResolvedValue({
      ok: true,
      pluginId: "matrix",
      targetDir: "/tmp/mangabaclaw-plugins/matrix",
      version: "1.2.3",
      npmResolution: {
        name: "@mangabaclaw/plugin-matrix",
        version: "1.2.3",
        resolvedSpec: "@mangabaclaw/plugin-matrix@1.2.3",
        integrity: "sha512-test",
        resolvedAt: "2026-05-01T00:00:00.000Z",
      },
    });
  });

  it("maps a missing configured plugin install to a structured finding and dry-run effect", async () => {
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          npmSpec: "@mangabaclaw/plugin-matrix@1.2.3",
          expectedIntegrity: "sha512-test",
        },
        trustedSourceLinkedOfficialInstall: true,
      },
    ]);

    const {
      configuredPluginInstallIssueToHealthFinding,
      configuredPluginInstallIssueToRepairEffect,
      detectConfiguredPluginInstallHealthIssues,
    } = await import("./missing-configured-plugin-install.js");
    const [issue] = await detectConfiguredPluginInstallHealthIssues({
      cfg: {
        channels: {
          matrix: { enabled: true, homeserver: "https://matrix.example.org" },
        },
      },
      env: {},
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(issue).toEqual({
      kind: "missing-install-record",
      pluginId: "matrix",
      installSpec: "@mangabaclaw/plugin-matrix@1.2.3",
    });
    expect(
      configuredPluginInstallIssueToHealthFinding(expectDefined(issue, "issue test invariant")),
    ).toMatchObject({
      checkId: "core/doctor/configured-plugin-installs",
      severity: "warning",
      target: "matrix",
      fixHint: "Run `mangabaclaw doctor --fix` to install @mangabaclaw/plugin-matrix@1.2.3.",
    });
    expect(
      configuredPluginInstallIssueToRepairEffect(expectDefined(issue, "issue test invariant")),
    ).toEqual({
      kind: "package",
      action: "would-install-configured-plugin",
      target: "matrix",
      dryRunSafe: false,
    });
  });

  it("maps package-update deferrals to structured findings without installing packages", async () => {
    const missingDiscordPath = path.resolve("/missing/discord");
    const records = {
      discord: {
        source: "npm",
        spec: "@mangabaclaw/discord",
        installPath: missingDiscordPath,
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "discord",
        pluginId: "discord",
        meta: { label: "Discord" },
        install: {
          npmSpec: "@mangabaclaw/discord",
        },
      },
    ]);

    const {
      configuredPluginInstallIssueToHealthFinding,
      configuredPluginInstallIssueToRepairEffect,
      detectConfiguredPluginInstallHealthIssues,
    } = await import("./missing-configured-plugin-install.js");
    const [issue] = await detectConfiguredPluginInstallHealthIssues({
      cfg: {
        plugins: {
          entries: {
            discord: { enabled: true },
          },
        },
        channels: {
          discord: { enabled: true },
        },
      },
      env: {
        MANGABACLAW_UPDATE_IN_PROGRESS: "1",
        MANGABACLAW_UPDATE_DEFER_CONFIGURED_PLUGIN_INSTALL_REPAIR: "1",
      },
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(issue).toEqual({
      kind: "deferred-package-manager-repair",
      pluginId: "discord",
      installPath: missingDiscordPath,
    });
    expect(
      configuredPluginInstallIssueToHealthFinding(expectDefined(issue, "issue test invariant")),
    ).toMatchObject({
      checkId: "core/doctor/configured-plugin-installs",
      severity: "warning",
      path: missingDiscordPath,
      target: "discord",
    });
    expect(
      configuredPluginInstallIssueToRepairEffect(expectDefined(issue, "issue test invariant")),
    ).toEqual({
      kind: "package",
      action: "would-defer-configured-plugin-install-repair",
      target: "discord",
      dryRunSafe: true,
    });
  });

  it("reports one finding when a configured plugin record points at a missing package", async () => {
    const missingDiscordPath = path.resolve("/missing/discord");
    const records = {
      discord: {
        source: "npm",
        spec: "@mangabaclaw/discord",
        installPath: missingDiscordPath,
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "discord",
        pluginId: "discord",
        meta: { label: "Discord" },
        install: {
          npmSpec: "@mangabaclaw/discord",
        },
      },
    ]);

    const { detectConfiguredPluginInstallHealthIssues } =
      await import("./missing-configured-plugin-install.js");
    const issues = await detectConfiguredPluginInstallHealthIssues({
      cfg: {
        plugins: {
          entries: {
            discord: { enabled: true },
          },
        },
        channels: {
          discord: { enabled: true },
        },
      },
      env: {},
    });

    expect(issues).toEqual([
      {
        kind: "missing-installed-payload",
        pluginId: "discord",
        installPath: missingDiscordPath,
        installSpec: "@mangabaclaw/discord",
      },
    ]);
  });

  it("persists no-op baseline records with the active plugin policy", async () => {
    const cfg = {
      plugins: {
        enabled: false,
        allow: ["matrix"],
        entries: { matrix: { enabled: false } },
      },
      channels: { matrix: { enabled: false } },
    } satisfies MangabaClawConfig;
    const baselineRecords = {};
    expect(resolveInstalledPluginIndexPolicyHash(cfg)).not.toBe(
      resolveInstalledPluginIndexPolicyHash(undefined),
    );

    const { repairMissingPluginInstallsForIds } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingPluginInstallsForIds({
      cfg,
      pluginIds: [],
      env: {},
      baselineRecords,
    });

    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).toHaveBeenCalledOnce();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).toHaveBeenCalledWith(
      baselineRecords,
      {
        config: cfg,
        env: {},
      },
    );
    expect(result.records).toBe(baselineRecords);
  });

  it("installs a missing configured MangabaClaw channel plugin from npm by default", async () => {
    const cfg = {
      security: { installPolicy: { enabled: true } },
      channels: {
        matrix: { enabled: true, homeserver: "https://matrix.example.org" },
      },
    } satisfies MangabaClawConfig;
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          npmSpec: "@mangabaclaw/plugin-matrix@1.2.3",
          expectedIntegrity: "sha512-test",
        },
        trustedSourceLinkedOfficialInstall: true,
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg,
      env: {},
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: "@mangabaclaw/plugin-matrix@1.2.3",
      extensionsDir: "/tmp/mangabaclaw-plugins",
      expectedPluginId: "matrix",
      expectedIntegrity: "sha512-test",
      trustedSourceLinkedOfficialInstall: true,
      config: cfg,
    });
    const records = mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords);
    expectRecordFields((records as Record<string, unknown>).matrix, {
      source: "npm",
      spec: "@mangabaclaw/plugin-matrix@1.2.3",
      installPath: "/tmp/mangabaclaw-plugins/matrix",
      version: "1.2.3",
    });
    expect(mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords, 0, 1)).toEqual({
      config: cfg,
      env: {},
    });
    expect(result.changes).toEqual([
      'Installed missing configured plugin "matrix" from @mangabaclaw/plugin-matrix@1.2.3.',
    ]);
    expect(result.warnings).toStrictEqual([]);
  });

  it("uses an explicit ClawHub install spec before npm", async () => {
    const cfg = {
      security: { installPolicy: { enabled: true } },
      channels: {
        matrix: { enabled: true, homeserver: "https://matrix.example.org" },
      },
    } satisfies MangabaClawConfig;
    const reviewNotice =
      "╭─ REVIEW RECOMMENDED - ClawHub has not completed a fresh clean check ─╮\n" +
      "│ • Status:            security scan is pending                         │\n" +
      "╰───────────────────────────────────────────────────────────────────────╯";
    const coloredReviewNotice = `\u001b[33m${reviewNotice}\u001b[39m`;
    mocks.installPluginFromClawHub.mockImplementationOnce(
      async (params: { logger?: { warn?: (message: string) => void } }) => {
        params.logger?.warn?.(coloredReviewNotice);
        return {
          ok: true,
          pluginId: "matrix",
          targetDir: "/tmp/mangabaclaw-plugins/matrix",
          version: "1.2.3",
          clawhub: {
            source: "clawhub",
            clawhubUrl: "https://clawhub.ai",
            clawhubPackage: "@mangabaclaw/plugin-matrix",
            clawhubFamily: "code-plugin",
            clawhubChannel: "official",
            version: "1.2.3",
            integrity: "sha256-clawhub",
            resolvedAt: "2026-05-01T00:00:00.000Z",
            clawpackSha256: "0".repeat(64),
            clawpackSpecVersion: 1,
            clawpackManifestSha256: "1".repeat(64),
            clawpackSize: 1234,
          },
        };
      },
    );
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          clawhubSpec: "clawhub:@mangabaclaw/plugin-matrix@stable",
          npmSpec: "@mangabaclaw/plugin-matrix@1.2.3",
          expectedIntegrity: "sha512-test",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg,
      env: {},
    });

    const clawHubCall = expectRecordFields(mockCallArg(mocks.installPluginFromClawHub), {
      spec: "clawhub:@mangabaclaw/plugin-matrix@stable",
      expectedPluginId: "matrix",
      config: cfg,
    });
    expect(clawHubCall.logger).toEqual(expect.objectContaining({ terminalLinks: false }));
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(result.changes).toEqual([
      'Installed missing configured plugin "matrix" from clawhub:@mangabaclaw/plugin-matrix@stable.',
    ]);
    expect(result.notices).toContain(reviewNotice);
    expect(result.notices?.[0]).not.toContain("\u001b");
    expect(result.warnings).toStrictEqual([]);
  });

  it("adds actionable acknowledgement guidance for risky ClawHub candidate failures", async () => {
    mocks.installPluginFromClawHub.mockResolvedValueOnce({
      ok: false,
      code: "clawhub_risk_acknowledgement_required",
      error:
        'ClawHub release "@mangabaclaw/plugin-matrix@stable" has trust warnings. Review the package and rerun with --acknowledge-clawhub-risk to continue.',
    });
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          clawhubSpec: "clawhub:@mangabaclaw/plugin-matrix@stable",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        channels: {
          matrix: { enabled: true, homeserver: "https://matrix.example.org" },
        },
      },
      env: {},
    });

    expect(result.warnings[0]).toContain(
      "mangabaclaw plugins install clawhub:@mangabaclaw/plugin-matrix@stable --acknowledge-clawhub-risk",
    );
  });

  it("adds repair warnings for blocked ClawHub update outcomes", async () => {
    const records = {
      demo: {
        source: "clawhub",
        spec: "clawhub:@mangabaclaw/plugin-demo@stable",
        clawhubPackage: "@mangabaclaw/plugin-demo",
        installPath: "/missing/demo",
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.updateNpmInstalledPlugins.mockResolvedValueOnce({
      changed: false,
      config: {
        plugins: {
          installs: records,
        },
      },
      outcomes: [
        {
          pluginId: "demo",
          status: "skipped",
          code: "clawhub_download_blocked",
          message:
            'Skipped demo ClawHub update: ClawHub release "@mangabaclaw/plugin-demo@1.2.4" cannot be installed because ClawHub flagged it as blocked or malicious. Review the security details above or choose a different version. Existing installed plugin left unchanged.',
        },
      ],
    });

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            demo: { enabled: true },
          },
        },
      },
      env: {},
    });

    expect(mocks.updateNpmInstalledPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginIds: ["demo"],
      }),
    );
    expect(result.changes).toStrictEqual([]);
    expect(result.warnings).toStrictEqual([
      'Skipped demo ClawHub update: ClawHub release "@mangabaclaw/plugin-demo@1.2.4" cannot be installed because ClawHub flagged it as blocked or malicious. Review the security details above or choose a different version. Existing installed plugin left unchanged.',
    ]);
  });

  it("sanitizes and shell-quotes ClawHub acknowledgement guidance specs before rendering commands", async () => {
    mocks.installPluginFromClawHub.mockResolvedValueOnce({
      ok: false,
      code: "clawhub_risk_acknowledgement_required",
      error:
        'ClawHub release "@mangabaclaw/plugin-matrix@stable" has trust warnings. Review the package and rerun with --acknowledge-clawhub-risk to continue.',
    });
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          clawhubSpec: "clawhub:@mangabaclaw/plugin-matrix\n\u001b[31m@stable;$(touch /tmp/pwned)",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        channels: {
          matrix: { enabled: true, homeserver: "https://matrix.example.org" },
        },
      },
      env: {},
    });

    const warning = result.warnings[0] ?? "";
    expect(warning).toContain(
      "mangabaclaw plugins install 'clawhub:@mangabaclaw/plugin-matrix\\n@stable;$(touch /tmp/pwned)' --acknowledge-clawhub-risk",
    );
    expect(warning).not.toContain(
      "mangabaclaw plugins install clawhub:@mangabaclaw/plugin-matrix\\n@stable;$(touch /tmp/pwned) --acknowledge-clawhub-risk",
    );
    expect(warning).not.toContain("\u001b");
    expect(warning).not.toContain("plugin-matrix\n");
  });

  it("installs a missing channel plugin selected by environment config from npm", async () => {
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "matrix",
        npmSpec: "@mangabaclaw/plugin-matrix",
        version: "1.2.3",
      }),
    );
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          npmSpec: "@mangabaclaw/plugin-matrix@1.2.3",
        },
        trustedSourceLinkedOfficialInstall: true,
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {},
      env: { MATRIX_HOMESERVER: "https://matrix.example.org" },
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: "@mangabaclaw/plugin-matrix@1.2.3",
      extensionsDir: "/tmp/mangabaclaw-plugins",
      expectedPluginId: "matrix",
      trustedSourceLinkedOfficialInstall: true,
    });
    const records = mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords);
    expectRecordFields((records as Record<string, unknown>).matrix, {
      source: "npm",
      spec: "@mangabaclaw/plugin-matrix@1.2.3",
      installPath: "/tmp/mangabaclaw-plugins/matrix",
    });
    expect(mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords, 0, 1)).toEqual({
      config: {},
      env: { MATRIX_HOMESERVER: "https://matrix.example.org" },
    });
    expect(result.changes).toEqual([
      'Installed missing configured plugin "matrix" from @mangabaclaw/plugin-matrix@1.2.3.',
    ]);
    expect(result.warnings).toStrictEqual([]);
  });

  it("falls back to npm when an MangabaClaw channel plugin artifact is unavailable on ClawHub", async () => {
    mocks.installPluginFromClawHub.mockResolvedValueOnce({
      ok: false,
      code: "artifact_unavailable",
      error: "ClawHub artifact download is not available yet.",
    });
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          clawhubSpec: "clawhub:@mangabaclaw/plugin-matrix@stable",
          npmSpec: "@mangabaclaw/plugin-matrix@1.2.3",
        },
        trustedSourceLinkedOfficialInstall: true,
      },
    ]);

    const { repairMissingPluginInstallsForIds } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingPluginInstallsForIds({
      cfg: {},
      pluginIds: [],
      channelIds: ["matrix"],
      env: {},
    });

    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: "@mangabaclaw/plugin-matrix@1.2.3",
      expectedPluginId: "matrix",
      trustedSourceLinkedOfficialInstall: true,
    });
    expect(result.changes).toEqual([
      'ClawHub clawhub:@mangabaclaw/plugin-matrix@stable unavailable for "matrix"; falling back to npm @mangabaclaw/plugin-matrix@1.2.3.',
      'Installed missing configured plugin "matrix" from @mangabaclaw/plugin-matrix@1.2.3.',
    ]);
    expect(result.warnings).toStrictEqual([]);
  });

  it("does not fall back from ClawHub to non-MangabaClaw npm packages", async () => {
    mocks.installPluginFromClawHub.mockResolvedValueOnce({
      ok: false,
      code: "artifact_download_unavailable",
      error: "ClawHub artifact download is not available yet.",
    });
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          clawhubSpec: "clawhub:@mangabaclaw/plugin-matrix@stable",
          npmSpec: "@someone-else/plugin-matrix@1.2.3",
        },
      },
    ]);

    const { repairMissingPluginInstallsForIds } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingPluginInstallsForIds({
      cfg: {},
      pluginIds: [],
      channelIds: ["matrix"],
      env: {},
    });

    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(result.changes).toStrictEqual([]);
    expect(result.warnings).toEqual([
      'Failed to install missing configured plugin "matrix" from clawhub:@mangabaclaw/plugin-matrix@stable: ClawHub artifact download is not available yet.',
    ]);
  });

  it("honors npm-first catalog metadata for missing MangabaClaw channel plugins", async () => {
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "twitch",
        npmSpec: "@mangabaclaw/twitch",
        version: "2026.5.2",
      }),
    );
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "twitch",
        pluginId: "twitch",
        meta: { label: "Twitch" },
        install: {
          npmSpec: "@mangabaclaw/twitch",
          defaultChoice: "npm",
        },
        trustedSourceLinkedOfficialInstall: true,
      },
    ]);

    const { repairMissingPluginInstallsForIds } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingPluginInstallsForIds({
      cfg: {},
      pluginIds: [],
      channelIds: ["twitch"],
      env: {},
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedNpmInstallSpec("@mangabaclaw/twitch"),
      expectedPluginId: "twitch",
      trustedSourceLinkedOfficialInstall: true,
    });
    expect(result.changes).toEqual([
      `Installed missing configured plugin "twitch" from ${expectedNpmInstallSpec("@mangabaclaw/twitch")}.`,
    ]);
  });

  it("repairs official plugins at the exact extended-stable core version", async () => {
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "diagnostics-otel",
        npmSpec: "@mangabaclaw/diagnostics-otel",
        version: VERSION,
      }),
    );
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      {
        id: "diagnostics-otel",
        label: "Diagnostics OpenTelemetry",
        install: {
          npmSpec: "@mangabaclaw/diagnostics-otel",
          defaultChoice: "npm",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    await repairMissingConfiguredPluginInstalls({
      cfg: {
        update: { channel: "extended-stable" },
        plugins: { entries: { "diagnostics-otel": { enabled: true } } },
      },
      env: {},
    });

    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: `@mangabaclaw/diagnostics-otel@${VERSION}`,
      expectedPluginId: "diagnostics-otel",
      trustedSourceLinkedOfficialInstall: true,
    });
    const persistedRecords = mockCallArg(
      mocks.writePersistedInstalledPluginIndexInstallRecords,
    ) as Record<string, unknown>;
    expectRecordFields(persistedRecords["diagnostics-otel"], {
      spec: "@mangabaclaw/diagnostics-otel",
      resolvedSpec: `@mangabaclaw/diagnostics-otel@${VERSION}`,
    });
  });

  it("does not install disabled configured plugin entries", async () => {
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      {
        id: "diagnostics-otel",
        label: "Diagnostics OpenTelemetry",
        install: {
          npmSpec: "@mangabaclaw/diagnostics-otel",
          defaultChoice: "npm",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            "diagnostics-otel": { enabled: false },
          },
        },
      },
      env: {},
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(result).toEqual({ changes: [], warnings: [], records: {} });
  });

  it.each([
    ["enabled-only disabled stub", { channels: { matrix: { enabled: false } } }],
    [
      "channel metadata",
      {
        channels: {
          modelByChannel: { matrix: { default: "openai/gpt-5.6-luna" } },
          " ": { homeserver: "https://matrix.example.org" },
        },
      },
    ],
    [
      "disabled configured channel",
      { channels: { matrix: { enabled: false, homeserver: "https://matrix.example.org" } } },
    ],
    [
      "matching disabled plugin entry",
      {
        plugins: { entries: { matrix: { enabled: false } } },
        channels: { matrix: { homeserver: "https://matrix.example.org" } },
      },
    ],
  ])("does not install channel plugins for a %s", async (_label, cfg) => {
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          npmSpec: "@mangabaclaw/plugin-matrix@1.2.3",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg,
      env: {},
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(result).toEqual({ changes: [], warnings: [], records: {} });
  });

  it("does not download configured channel plugins that are still bundled", async () => {
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        origin: "bundled",
        meta: { label: "Matrix" },
        install: {
          npmSpec: "@mangabaclaw/matrix",
        },
      },
    ]);
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [
        {
          id: "matrix",
          origin: "bundled",
          packageName: "@mangabaclaw/matrix",
          channels: ["matrix"],
        },
      ],
      diagnostics: [],
    });
    mockCurrentBundledPlugin("matrix", "@mangabaclaw/matrix");

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            matrix: { enabled: true },
          },
        },
        channels: {
          matrix: { enabled: true, homeserver: "https://matrix.example.org" },
        },
      },
      env: {},
    });

    expect(mocks.updateNpmInstalledPlugins).not.toHaveBeenCalled();
    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(result).toEqual({ changes: [], warnings: [], records: {} });
  });

  it("removes stale managed install records when the configured plugin is bundled", async () => {
    const records = {
      matrix: {
        source: "npm",
        spec: "@mangabaclaw/matrix",
        installPath: "/missing/matrix",
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        origin: "bundled",
        meta: { label: "Matrix" },
        install: {
          npmSpec: "@mangabaclaw/matrix",
        },
      },
    ]);
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [
        {
          id: "matrix",
          origin: "bundled",
          packageName: "@mangabaclaw/matrix",
          channels: ["matrix"],
        },
      ],
      diagnostics: [
        {
          pluginId: "matrix",
          message: "manifest without channelConfigs metadata",
        },
      ],
    });
    mockCurrentBundledPlugin("matrix", "@mangabaclaw/matrix");

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            matrix: { enabled: true },
          },
        },
        channels: {
          matrix: { enabled: true, homeserver: "https://matrix.example.org" },
        },
      },
      env: {},
    });

    expect(mocks.updateNpmInstalledPlugins).not.toHaveBeenCalled();
    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).toHaveBeenCalledWith(
      {},
      {
        config: expect.any(Object),
        env: {},
      },
    );
    expect(result).toEqual({
      changes: ['Removed stale managed install record for bundled plugin "matrix".'],
      warnings: [],
      pluginInventoryChanged: true,
      records: {},
    });
  });

  it("uses current bundled discovery to remove records before stale snapshots can reinstall official plugins", async () => {
    const records = {
      "google-meet": {
        source: "npm",
        spec: "@mangabaclaw/google-meet",
        resolvedName: "@mangabaclaw/google-meet",
        installPath: "/missing/google-meet",
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [
        {
          id: "google-meet",
          origin: "npm",
          packageName: "@mangabaclaw/google-meet",
        },
      ],
      diagnostics: [],
    });
    mockCurrentBundledPlugin("google-meet", "@mangabaclaw/google-meet");
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      {
        id: "google-meet",
        label: "Google Meet",
        install: { npmSpec: "@mangabaclaw/google-meet" },
        mangabaclaw: {
          id: "google-meet",
          install: { npmSpec: "@mangabaclaw/google-meet" },
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            "google-meet": { enabled: true },
          },
        },
      },
      env: {},
    });

    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).toHaveBeenCalledWith(
      {},
      {
        config: expect.any(Object),
        env: {},
      },
    );
    expect(result).toEqual({
      changes: ['Removed stale managed install record for bundled plugin "google-meet".'],
      warnings: [],
      pluginInventoryChanged: true,
      records: {},
    });
  });

  it("installs an official external plugin when only a stale bundled descriptor remains", async () => {
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [
        {
          id: "discord",
          origin: "bundled",
          packageName: "@mangabaclaw/discord",
          channels: ["discord"],
        },
      ],
      diagnostics: [],
    });
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      {
        id: "discord",
        label: "Discord",
        install: { npmSpec: "@mangabaclaw/discord", defaultChoice: "npm" },
      },
    ]);
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "discord",
        npmSpec: "@mangabaclaw/discord",
        version: "2026.8.1",
      }),
    );

    const result = await repairConfiguredPlugins({
      plugins: {
        entries: {
          discord: { enabled: true },
        },
      },
    });

    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedNpmInstallSpec("@mangabaclaw/discord"),
      expectedPluginId: "discord",
      trustedSourceLinkedOfficialInstall: true,
    });
    expectRecordFields(result.records.discord, {
      source: "npm",
      spec: "@mangabaclaw/discord",
      installPath: "/tmp/mangabaclaw-plugins/discord",
    });
    expect(result.changes).toEqual([
      `Installed missing configured plugin "discord" from ${expectedNpmInstallSpec("@mangabaclaw/discord")}.`,
    ]);
  });

  it("removes stale bundled install records even when the plugin is not configured", async () => {
    const records = {
      "google-meet": {
        source: "npm",
        spec: "@mangabaclaw/google-meet",
        resolvedName: "@mangabaclaw/google-meet",
        installPath: "/missing/google-meet",
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [],
      diagnostics: [],
    });
    mockCurrentBundledPlugin("google-meet", "@mangabaclaw/google-meet");

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {},
      env: {},
    });

    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).toHaveBeenCalledWith(
      {},
      {
        config: {},
        env: {},
      },
    );
    expect(result).toEqual({
      changes: ['Removed stale managed install record for bundled plugin "google-meet".'],
      warnings: [],
      pluginInventoryChanged: true,
      records: {},
    });
  });

  it.each([
    [
      "npm",
      {
        source: "npm",
        spec: "@mangabaclaw/matrix-fork",
        resolvedName: "@mangabaclaw/matrix-fork",
        resolvedSpec: "@mangabaclaw/matrix-fork@1.2.3",
        installPath: "/missing/matrix-fork",
      },
    ],
    [
      "clawhub",
      {
        source: "clawhub",
        spec: "clawhub:@mangabaclaw/matrix-fork@stable",
        clawhubPackage: "@mangabaclaw/matrix-fork",
        installPath: "/missing/matrix-fork",
      },
    ],
  ])(
    "keeps %s install records whose package names only share a bundled prefix",
    async (_, record) => {
      const records = { matrix: record };
      mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
      mocks.listChannelPluginCatalogEntries.mockReturnValue([
        {
          id: "matrix",
          pluginId: "matrix",
          origin: "bundled",
          meta: { label: "Matrix" },
          install: {
            npmSpec: "@mangabaclaw/matrix",
          },
        },
      ]);
      mocks.loadPluginMetadataSnapshot.mockReturnValue({
        plugins: [
          {
            id: "matrix",
            origin: "bundled",
            packageName: "@mangabaclaw/matrix",
            channels: ["matrix"],
          },
        ],
        diagnostics: [
          {
            pluginId: "matrix",
            message: "manifest without channelConfigs metadata",
          },
        ],
      });
      mockCurrentBundledPlugin("matrix", "@mangabaclaw/matrix");

      const { repairMissingConfiguredPluginInstalls } =
        await import("./missing-configured-plugin-install.js");
      const result = await repairMissingConfiguredPluginInstalls({
        cfg: {
          plugins: {
            entries: {
              matrix: { enabled: true },
            },
          },
          channels: {
            matrix: { enabled: true, homeserver: "https://matrix.example.org" },
          },
        },
        env: {},
      });

      expect(mocks.updateNpmInstalledPlugins).not.toHaveBeenCalled();
      expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
      expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
      expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
      expect(result).toEqual({ changes: [], warnings: [], records });
    },
  );

  it("defers missing external payload repair during the package update doctor pass", async () => {
    const records = {
      discord: {
        source: "npm",
        spec: "@mangabaclaw/discord",
        installPath: "/missing/discord",
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "discord",
        pluginId: "discord",
        meta: { label: "Discord" },
        install: {
          npmSpec: "@mangabaclaw/discord",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            discord: { enabled: true },
          },
        },
        channels: {
          discord: { enabled: true },
        },
      },
      env: {
        MANGABACLAW_UPDATE_IN_PROGRESS: "1",
        MANGABACLAW_UPDATE_DEFER_CONFIGURED_PLUGIN_INSTALL_REPAIR: "1",
      },
    });

    expect(mocks.updateNpmInstalledPlugins).not.toHaveBeenCalled();
    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(result).toEqual({
      changes: [
        'Skipped package-manager repair for configured plugin "discord" during package update; rerun "mangabaclaw doctor --fix" after the update completes.',
      ],
      warnings: [],
      deferredRepairDetails: [
        'Skipped package-manager repair for configured plugin "discord" during package update; rerun "mangabaclaw doctor --fix" after the update completes.',
      ],
      records,
    });
  });

  it("updates an existing npm target when stale baseline records miss an installed package", async () => {
    const npmRoot = tempDirs.make("mangabaclaw-plugin-stub-repair-");
    const packageDir = path.join(npmRoot, "node_modules", "@mangabaclaw", "discord");
    fs.mkdirSync(packageDir, { recursive: true });
    mocks.resolveDefaultPluginNpmDir.mockReturnValue(npmRoot);
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "discord",
        pluginId: "discord",
        meta: { label: "Discord" },
        install: {
          npmSpec: "@mangabaclaw/discord",
        },
      },
    ]);
    mocks.installPluginFromNpmSpec.mockResolvedValue({
      ok: true,
      pluginId: "discord",
      targetDir: packageDir,
      version: "1.2.3",
      npmResolution: {
        name: "@mangabaclaw/discord",
        version: "1.2.3",
        resolvedSpec: "@mangabaclaw/discord@1.2.3",
        integrity: "sha512-discord",
        resolvedAt: "2026-05-01T00:00:00.000Z",
      },
    });

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            discord: { enabled: true },
          },
        },
        channels: {
          discord: { enabled: true },
        },
      },
      env: {
        MANGABACLAW_UPDATE_POST_CORE_CONVERGENCE: "1",
      },
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedNpmInstallSpec("@mangabaclaw/discord"),
      expectedPluginId: "discord",
      npmDir: npmRoot,
      mode: "update",
    });
    expect(result.changes).toEqual([
      `Installed missing configured plugin "discord" from ${expectedNpmInstallSpec("@mangabaclaw/discord")}.`,
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.records.discord?.installPath).toBe(packageDir);
  });

  it("retries npm repair as an update when the install target appears stale", async () => {
    const cfg = {
      security: { installPolicy: { enabled: true } },
      plugins: {
        entries: {
          discord: { enabled: true },
        },
      },
    } satisfies MangabaClawConfig;
    const npmRoot = tempDirs.make("mangabaclaw-plugin-stub-repair-");
    const packageDir = path.join(npmRoot, "node_modules", "@mangabaclaw", "discord");
    mocks.resolveDefaultPluginNpmDir.mockReturnValue(npmRoot);
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "discord",
        pluginId: "discord",
        meta: { label: "Discord" },
        install: {
          npmSpec: "@mangabaclaw/discord",
        },
      },
    ]);
    mocks.installPluginFromNpmSpec
      .mockResolvedValueOnce({
        ok: false,
        error: `plugin already exists: ${packageDir} (delete it first)`,
      })
      .mockResolvedValueOnce({
        ok: true,
        pluginId: "discord",
        targetDir: packageDir,
        version: "1.2.3",
        npmResolution: {
          name: "@mangabaclaw/discord",
          version: "1.2.3",
          resolvedSpec: "@mangabaclaw/discord@1.2.3",
          integrity: "sha512-discord",
          resolvedAt: "2026-05-01T00:00:00.000Z",
        },
      });

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg,
      env: {
        MANGABACLAW_UPDATE_POST_CORE_CONVERGENCE: "1",
      },
    });

    expect(mocks.installPluginFromNpmSpec).toHaveBeenCalledTimes(2);
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec, 0), {
      spec: expectedNpmInstallSpec("@mangabaclaw/discord"),
      npmDir: npmRoot,
      mode: "install",
      config: cfg,
    });
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec, 1), {
      spec: expectedNpmInstallSpec("@mangabaclaw/discord"),
      npmDir: npmRoot,
      mode: "update",
      config: cfg,
    });
    expect(result.warnings).toEqual([]);
    expect(result.records.discord?.installPath).toBe(packageDir);
  });

  it("prefers an existing npm payload over ClawHub during post-core repair", async () => {
    const npmRoot = tempDirs.make("mangabaclaw-plugin-stub-repair-");
    const packageDir = path.join(npmRoot, "node_modules", "@mangabaclaw", "matrix");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify({ name: "@mangabaclaw/matrix", version: "1.2.3" }),
    );
    mocks.resolveDefaultPluginNpmDir.mockReturnValue(npmRoot);
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          clawhubSpec: "clawhub:@mangabaclaw/matrix",
          npmSpec: "@mangabaclaw/matrix",
        },
      },
    ]);
    mocks.installPluginFromClawHub.mockResolvedValue({
      ok: false,
      error: 'Plugin "@mangabaclaw/matrix" requires plugin API >=2026.5.18.',
    });
    mocks.installPluginFromNpmSpec.mockResolvedValue({
      ok: true,
      pluginId: "matrix",
      targetDir: packageDir,
      version: "1.2.3",
      npmResolution: {
        name: "@mangabaclaw/matrix",
        version: "1.2.3",
        resolvedSpec: "@mangabaclaw/matrix@1.2.3",
        integrity: "sha512-matrix",
        resolvedAt: "2026-05-01T00:00:00.000Z",
      },
    });

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            matrix: { enabled: true },
          },
        },
        channels: {
          matrix: { enabled: true },
        },
      },
      env: {
        MANGABACLAW_UPDATE_POST_CORE_CONVERGENCE: "1",
      },
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([]);
    expectRecordFields(result.records.matrix, {
      source: "npm",
      spec: "@mangabaclaw/matrix",
      installPath: packageDir,
      version: "1.2.3",
      resolvedName: "@mangabaclaw/matrix",
      resolvedVersion: "1.2.3",
      resolvedSpec: "@mangabaclaw/matrix@1.2.3",
    });
  });

  it("passes the post-core compatibility host version to ClawHub repair", async () => {
    const npmRoot = tempDirs.make("mangabaclaw-plugin-stub-repair-");
    mocks.resolveDefaultPluginNpmDir.mockReturnValue(npmRoot);
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "whatsapp",
        pluginId: "whatsapp",
        meta: { label: "WhatsApp" },
        install: {
          clawhubSpec: "clawhub:@mangabaclaw/whatsapp",
          npmSpec: "@mangabaclaw/whatsapp",
        },
      },
    ]);
    mocks.installPluginFromClawHub.mockResolvedValue({
      ok: true,
      pluginId: "whatsapp",
      targetDir: "/tmp/mangabaclaw-plugins/whatsapp",
      version: "1.2.3",
      clawhub: {
        source: "clawhub",
        clawhubUrl: "https://clawhub.ai",
        clawhubPackage: "@mangabaclaw/whatsapp",
        clawhubFamily: "code-plugin",
        clawhubChannel: "official",
        version: "1.2.3",
        integrity: "sha256-whatsapp",
        resolvedAt: "2026-05-01T00:00:00.000Z",
        clawpackSha256: "2".repeat(64),
        clawpackSpecVersion: 1,
        clawpackManifestSha256: "3".repeat(64),
        clawpackSize: 1234,
      },
    });

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            whatsapp: { enabled: true },
          },
        },
        channels: {
          whatsapp: { enabled: true },
        },
      },
      env: {
        MANGABACLAW_COMPATIBILITY_HOST_VERSION: "2026.5.19",
        MANGABACLAW_UPDATE_POST_CORE_CONVERGENCE: "1",
      },
    });

    expectRecordFields(mockCallArg(mocks.installPluginFromClawHub), {
      spec: expectedClawHubInstallSpec("clawhub:@mangabaclaw/whatsapp"),
      env: {
        MANGABACLAW_COMPATIBILITY_HOST_VERSION: "2026.5.19",
        MANGABACLAW_UPDATE_POST_CORE_CONVERGENCE: "1",
      },
      mode: "install",
    });
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([]);
    expectRecordFields(result.records.whatsapp, {
      source: "clawhub",
      spec: "clawhub:@mangabaclaw/whatsapp",
      installPath: "/tmp/mangabaclaw-plugins/whatsapp",
      clawhubPackage: "@mangabaclaw/whatsapp",
    });
  });

  it("repairs missing external payload during post-core convergence even with MANGABACLAW_UPDATE_IN_PROGRESS=1", async () => {
    const records = {
      discord: {
        source: "npm",
        spec: "@mangabaclaw/discord",
        installPath: "/missing/discord",
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "discord",
        pluginId: "discord",
        meta: { label: "Discord" },
        install: { npmSpec: "@mangabaclaw/discord" },
      },
    ]);
    mocks.updateNpmInstalledPlugins.mockResolvedValue({
      config: {
        plugins: {
          installs: { discord: { source: "npm", installPath: "/repaired/discord" } },
        },
      },
      changed: true,
      outcomes: [{ pluginId: "discord", status: "updated", message: "ok" }],
    });

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: { discord: { enabled: true } },
        },
        channels: {
          discord: { enabled: true },
        },
      },
      env: {
        MANGABACLAW_UPDATE_IN_PROGRESS: "1",
        MANGABACLAW_UPDATE_POST_CORE_CONVERGENCE: "1",
      },
    });

    expect(mocks.updateNpmInstalledPlugins).toHaveBeenCalledTimes(1);
    expect(result.warnings).toEqual([]);
    expect(result.changes[0]).toBe('Repaired missing configured plugin "discord".');
    expectRecordFields(result.records.discord, {
      source: "npm",
      installPath: "/repaired/discord",
    });
  });

  it("defers channel-selected external payload repair during the package update doctor pass", async () => {
    const records = {
      discord: {
        source: "npm",
        spec: "@mangabaclaw/discord",
        installPath: "/missing/discord",
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "discord",
        pluginId: "discord",
        meta: { label: "Discord" },
        install: {
          npmSpec: "@mangabaclaw/discord",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        channels: {
          discord: { enabled: true, token: "secret" },
        },
      },
      env: {
        MANGABACLAW_UPDATE_IN_PROGRESS: "1",
        MANGABACLAW_UPDATE_DEFER_CONFIGURED_PLUGIN_INSTALL_REPAIR: "1",
      },
    });

    expect(mocks.updateNpmInstalledPlugins).not.toHaveBeenCalled();
    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(result).toEqual({
      changes: [
        'Skipped package-manager repair for configured plugin "discord" during package update; rerun "mangabaclaw doctor --fix" after the update completes.',
      ],
      warnings: [],
      deferredRepairDetails: [
        'Skipped package-manager repair for configured plugin "discord" during package update; rerun "mangabaclaw doctor --fix" after the update completes.',
      ],
      records,
    });
  });

  it("does not install channel-selected external plugins during an opted-in package update doctor pass", async () => {
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "discord",
        pluginId: "discord",
        meta: { label: "Discord" },
        install: {
          npmSpec: "@mangabaclaw/discord",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        channels: {
          discord: { enabled: true, token: "secret" },
        },
      },
      env: {
        MANGABACLAW_UPDATE_IN_PROGRESS: "1",
        MANGABACLAW_UPDATE_DEFER_CONFIGURED_PLUGIN_INSTALL_REPAIR: "1",
      },
    });

    expect(mocks.updateNpmInstalledPlugins).not.toHaveBeenCalled();
    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(result).toEqual({ changes: [], warnings: [], records: {} });
  });

  it("installs channel-selected external plugins during a legacy package update doctor pass", async () => {
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "discord",
        npmSpec: "@mangabaclaw/discord",
        version: "2026.5.17",
        resolution: {
          resolvedAt: "2026-05-17T00:00:00.000Z",
        },
      }),
    );
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "discord",
        pluginId: "discord",
        meta: { label: "Discord" },
        install: {
          npmSpec: "@mangabaclaw/discord",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        channels: {
          discord: { enabled: true, token: "secret" },
        },
      },
      env: {
        MANGABACLAW_UPDATE_IN_PROGRESS: "1",
      },
    });

    expect(mocks.installPluginFromNpmSpec).toHaveBeenCalledTimes(1);
    expect(result.changes).toEqual([
      `Installed missing configured plugin "discord" from ${expectedNpmInstallSpec("@mangabaclaw/discord")}.`,
    ]);
    expectRecordFields(result.records.discord, {
      source: "npm",
      installPath: "/tmp/mangabaclaw-plugins/discord",
    });
  });

  it("prefers npm over ClawHub during a legacy package update doctor pass", async () => {
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "whatsapp",
        npmSpec: "@mangabaclaw/whatsapp",
        version: "2026.5.17",
        resolution: {
          resolvedAt: "2026-05-17T00:00:00.000Z",
        },
      }),
    );
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "whatsapp",
        pluginId: "whatsapp",
        meta: { label: "WhatsApp" },
        install: {
          clawhubSpec: "clawhub:@mangabaclaw/whatsapp",
          npmSpec: "@mangabaclaw/whatsapp",
          defaultChoice: "clawhub",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        channels: {
          whatsapp: { enabled: true, allowFrom: ["+15555550123"] },
        },
      },
      env: {
        MANGABACLAW_UPDATE_IN_PROGRESS: "1",
      },
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedNpmInstallSpec("@mangabaclaw/whatsapp"),
      expectedPluginId: "whatsapp",
    });
    expect(result.changes).toEqual([
      `Installed missing configured plugin "whatsapp" from ${expectedNpmInstallSpec("@mangabaclaw/whatsapp")}.`,
    ]);
    expectRecordFields(result.records.whatsapp, {
      source: "npm",
      installPath: "/tmp/mangabaclaw-plugins/whatsapp",
    });
  });

  it("keeps ClawHub-only candidates available during a legacy package update doctor pass", async () => {
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          clawhubSpec: "clawhub:@mangabaclaw/plugin-matrix@stable",
          defaultChoice: "clawhub",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        channels: {
          matrix: { enabled: true, homeserver: "https://matrix.example.org" },
        },
      },
      env: {
        MANGABACLAW_UPDATE_IN_PROGRESS: "1",
      },
    });

    expectRecordFields(mockCallArg(mocks.installPluginFromClawHub), {
      spec: "clawhub:@mangabaclaw/plugin-matrix@stable",
      expectedPluginId: "matrix",
    });
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(result.changes).toEqual([
      'Installed missing configured plugin "matrix" from clawhub:@mangabaclaw/plugin-matrix@stable.',
    ]);
  });

  it("does not install configured plugins when plugins are globally disabled", async () => {
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          npmSpec: "@mangabaclaw/plugin-matrix@1.2.3",
        },
      },
    ]);
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      {
        id: "codex",
        label: "Codex",
        install: {
          npmSpec: "@mangabaclaw/codex",
          defaultChoice: "npm",
        },
      },
      {
        id: "diagnostics-otel",
        label: "Diagnostics OpenTelemetry",
        install: {
          npmSpec: "@mangabaclaw/diagnostics-otel",
          defaultChoice: "npm",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          enabled: false,
          entries: {
            "diagnostics-otel": { enabled: true },
          },
        },
        channels: {
          matrix: { homeserver: "https://matrix.example.org" },
        },
        agents: {
          defaults: {
            agentRuntime: { id: "codex" },
          },
        },
      },
      env: {},
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(result).toEqual({ changes: [], warnings: [], records: {} });
  });

  it("does not install plugins merely listed in plugins.allow", async () => {
    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          allow: ["codex"],
        },
      },
      env: {},
    });

    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(result).toEqual({ changes: [], warnings: [], records: {} });
  });

  it("installs a missing third-party downloadable plugin from npm only", async () => {
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "wecom",
        npmSpec: "@wecom/wecom-mangabaclaw-plugin",
        version: "2026.4.23",
        resolution: {
          integrity: "sha512-third-party",
        },
      }),
    );
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "wecom",
        pluginId: "wecom",
        meta: { label: "WeCom" },
        install: {
          npmSpec: "@wecom/wecom-mangabaclaw-plugin@2026.4.23",
        },
      },
    ]);

    const { repairMissingPluginInstallsForIds } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingPluginInstallsForIds({
      cfg: {},
      pluginIds: [],
      channelIds: ["wecom"],
      env: {},
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    const installArg = mockCallArg(mocks.installPluginFromNpmSpec);
    expectRecordFields(installArg, {
      spec: "@wecom/wecom-mangabaclaw-plugin@2026.4.23",
      expectedPluginId: "wecom",
    });
    expect(installArg).not.toHaveProperty("trustedSourceLinkedOfficialInstall", true);
    expect(result.changes).toEqual([
      'Installed missing configured plugin "wecom" from @wecom/wecom-mangabaclaw-plugin@2026.4.23.',
    ]);
  });

  it("upgrades v2026.7.1-beta.3 Codex Supervisor config and installs Codex", async () => {
    // This is the bundled plugin id and config surface shipped by v2026.7.1-beta.3.
    const migration = applyLegacyDoctorMigrations({
      plugins: {
        allow: ["codex-supervisor"],
        entries: {
          "codex-supervisor": {
            enabled: true,
            config: {
              endpoints: [
                {
                  id: "local",
                  label: "Local Codex",
                  transport: "stdio-proxy",
                  command: "codex",
                  args: ["app-server", "--listen", "stdio://"],
                  cwd: "/tmp/mangabaclaw",
                },
              ],
              allowRawTranscripts: true,
              allowWriteControls: false,
            },
          },
        },
      },
    });

    expect(migration.next).not.toBeNull();
    const cfg = migration.next as MangabaClawConfig;
    expect(cfg.plugins?.allow).toEqual(["codex"]);
    expect(cfg.plugins?.entries?.codex).toEqual({
      enabled: true,
      config: {
        supervision: {
          enabled: true,
          endpoints: [
            {
              id: "local",
              label: "Local Codex",
              transport: "stdio-proxy",
              command: "codex",
              args: ["app-server", "--listen", "stdio://"],
              cwd: "/tmp/mangabaclaw",
            },
          ],
          allowRawTranscripts: true,
          allowWriteControls: false,
        },
      },
    });
    expect(cfg.plugins?.entries).not.toHaveProperty("codex-supervisor");
    expect(migration.changes).toEqual(
      expect.arrayContaining([
        "Moved plugins.entries.codex-supervisor to plugins.entries.codex.config.supervision.",
        "Rewrote plugins.allow codex-supervisor references to codex.",
      ]),
    );

    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "codex",
        npmSpec: "@mangabaclaw/codex",
        version: "2026.7.2",
        resolution: {
          integrity: "sha512-codex-supervisor-upgrade",
          resolvedAt: "2026-07-10T00:00:00.000Z",
        },
      }),
    );
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      {
        id: "codex",
        label: "Codex",
        install: {
          npmSpec: "@mangabaclaw/codex",
          defaultChoice: "npm",
        },
      },
    ]);

    const { repairMissingPluginInstallsForIds } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingPluginInstallsForIds({
      cfg,
      pluginIds: ["codex"],
      env: {},
      baselineRecords: {},
    });

    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedCodexInstallSpec(),
      expectedPluginId: "codex",
      trustedSourceLinkedOfficialInstall: true,
    });
    const records = mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords);
    expectRecordFields((records as Record<string, unknown>).codex, {
      source: "npm",
      spec: "@mangabaclaw/codex",
      installPath: "/tmp/mangabaclaw-plugins/codex",
      version: "2026.7.2",
      resolvedName: "@mangabaclaw/codex",
      resolvedSpec: "@mangabaclaw/codex@2026.7.2",
      integrity: "sha512-codex-supervisor-upgrade",
    });
    expect(mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords, 0, 1)).toEqual({
      config: cfg,
      env: {},
    });
    expect(result.changes).toEqual([
      `Installed missing configured plugin "codex" from ${expectedCodexInstallSpec()}.`,
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.repairedPluginIds).toEqual(["codex"]);
    expect(result.records).toEqual(records);
  });

  it("installs a missing default Codex runtime plugin from the official external catalog", async () => {
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "codex",
        npmSpec: "@mangabaclaw/codex",
        version: "2026.5.2",
      }),
    );
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      {
        id: "codex",
        label: "Codex",
        install: {
          npmSpec: "@mangabaclaw/codex",
          defaultChoice: "npm",
        },
      },
    ]);

    const { repairMissingPluginInstallsForIds } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingPluginInstallsForIds({
      cfg: {
        agents: {
          defaults: {
            model: "openai/gpt-5.4",
            agentRuntime: { id: "codex" },
          },
        },
      },
      pluginIds: ["codex"],
      env: {},
    });

    expect(mocks.resolveProviderInstallCatalogEntries).toHaveBeenCalled();
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedCodexInstallSpec(),
      expectedPluginId: "codex",
      trustedSourceLinkedOfficialInstall: true,
    });
    const records = mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords);
    expectRecordFields((records as Record<string, unknown>).codex, {
      source: "npm",
      spec: "@mangabaclaw/codex",
      installPath: "/tmp/mangabaclaw-plugins/codex",
      version: "2026.5.2",
    });
    expect(mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords, 0, 1)).toEqual({
      config: expect.any(Object),
      env: {},
    });
    expect(result.changes).toEqual([
      `Installed missing configured plugin "codex" from ${expectedCodexInstallSpec()}.`,
    ]);
    expect(result.warnings).toStrictEqual([]);
  });

  it("refreshes a stale managed Codex runtime plugin selected by the OpenAI Codex route", async () => {
    const installDir = tempDirs.make("mangabaclaw-plugin-stub-repair-");
    fs.writeFileSync(
      path.join(installDir, "package.json"),
      JSON.stringify({ name: "@mangabaclaw/codex", version: "2026.5.6" }),
    );
    const records = {
      codex: {
        source: "npm",
        spec: "@mangabaclaw/codex",
        resolvedName: "@mangabaclaw/codex",
        resolvedSpec: "@mangabaclaw/codex@2026.5.6",
        resolvedVersion: "2026.5.6",
        version: "2026.5.6",
        integrity: "sha512-old-codex",
        installPath: installDir,
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [
        {
          id: "codex",
          packageVersion: "2026.5.6",
          providers: ["codex"],
        },
      ],
      diagnostics: [],
      byPluginId: new Map([
        [
          "codex",
          {
            id: "codex",
            packageVersion: "2026.5.6",
            providers: ["codex"],
          },
        ],
      ]),
    });
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "codex",
        npmSpec: "@mangabaclaw/codex",
        version: VERSION,
        resolution: {
          integrity: "sha512-new-codex",
        },
      }),
    );
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      {
        id: "codex",
        label: "Codex",
        install: {
          npmSpec: "@mangabaclaw/codex",
          defaultChoice: "npm",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        agents: {
          defaults: {
            model: "openai/gpt-5.5",
          },
        },
      },
      env: {},
    });

    expect(mocks.resolveDirectBundledProviderPolicySurface).toHaveBeenCalledWith("openai");
    expect(mocks.updateNpmInstalledPlugins).not.toHaveBeenCalled();
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedCodexInstallSpec(),
      expectedPluginId: "codex",
      trustedSourceLinkedOfficialInstall: true,
      mode: "update",
    });
    expect(result.changes).toEqual([
      `Refreshed stale configured plugin "codex" from ${expectedCodexInstallSpec()}.`,
    ]);
    expectRecordFields(result.records.codex, {
      source: "npm",
      spec: "@mangabaclaw/codex",
      installPath: "/tmp/mangabaclaw-plugins/codex",
      version: VERSION,
      resolvedName: "@mangabaclaw/codex",
      resolvedVersion: VERSION,
      resolvedSpec: `@mangabaclaw/codex@${VERSION}`,
    });
  });

  it("does not refresh a converged beta Codex runtime plugin on the second doctor pass", async () => {
    const codexBetaVersion = `${currentMangabaClawReleaseBase()}-beta.4`;
    const installDir = tempDirs.make("mangabaclaw-plugin-stub-repair-");
    fs.writeFileSync(
      path.join(installDir, "package.json"),
      JSON.stringify({ name: "@mangabaclaw/codex", version: "2026.5.6" }),
    );
    const records = {
      codex: {
        source: "npm",
        spec: "@mangabaclaw/codex",
        resolvedName: "@mangabaclaw/codex",
        resolvedSpec: "@mangabaclaw/codex@2026.5.6",
        resolvedVersion: "2026.5.6",
        version: "2026.5.6",
        integrity: "sha512-old-codex",
        installPath: installDir,
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [
        {
          id: "codex",
          packageVersion: "2026.5.6",
          providers: ["codex"],
        },
      ],
      diagnostics: [],
      byPluginId: new Map([
        [
          "codex",
          {
            id: "codex",
            packageVersion: "2026.5.6",
            providers: ["codex"],
          },
        ],
      ]),
    });
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "codex",
        npmSpec: "@mangabaclaw/codex",
        targetDir: installDir,
        version: codexBetaVersion,
        resolution: {
          integrity: "sha512-new-codex-beta",
        },
      }),
    );
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      {
        id: "codex",
        label: "Codex",
        install: {
          npmSpec: "@mangabaclaw/codex",
          defaultChoice: "npm",
        },
      },
    ]);

    const cfg = {
      update: { channel: "beta" as const },
      agents: {
        defaults: {
          model: "openai/gpt-5.5",
        },
      },
    };
    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const firstPass = await repairMissingConfiguredPluginInstalls({
      cfg,
      env: {},
    });

    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: "@mangabaclaw/codex@beta",
      expectedPluginId: "codex",
      trustedSourceLinkedOfficialInstall: true,
      mode: "update",
    });
    expect(firstPass.changes).toEqual([
      'Refreshed stale configured plugin "codex" from @mangabaclaw/codex@beta.',
    ]);
    expectRecordFields(firstPass.records.codex, {
      source: "npm",
      spec: "@mangabaclaw/codex",
      installPath: installDir,
      version: codexBetaVersion,
      resolvedName: "@mangabaclaw/codex",
      resolvedVersion: codexBetaVersion,
      resolvedSpec: `@mangabaclaw/codex@${codexBetaVersion}`,
    });

    mocks.installPluginFromNpmSpec.mockClear();
    mocks.writePersistedInstalledPluginIndexInstallRecords.mockClear();
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValueOnce(firstPass.records);
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [
        {
          id: "codex",
          packageVersion: codexBetaVersion,
          providers: ["codex"],
        },
      ],
      diagnostics: [],
      byPluginId: new Map([
        [
          "codex",
          {
            id: "codex",
            packageVersion: codexBetaVersion,
            providers: ["codex"],
          },
        ],
      ]),
    });

    const secondPass = await repairMissingConfiguredPluginInstalls({
      cfg,
      env: {},
    });

    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(secondPass).toEqual({ changes: [], warnings: [], records: firstPass.records });
  });

  it("does not downgrade a newer managed Codex runtime plugin", async () => {
    const installDir = tempDirs.make("mangabaclaw-plugin-stub-repair-");
    fs.writeFileSync(
      path.join(installDir, "package.json"),
      JSON.stringify({ name: "@mangabaclaw/codex", version: "9999.1.1" }),
    );
    const records = {
      codex: {
        source: "npm",
        spec: "@mangabaclaw/codex",
        resolvedName: "@mangabaclaw/codex",
        resolvedSpec: "@mangabaclaw/codex@9999.1.1",
        resolvedVersion: "9999.1.1",
        version: "9999.1.1",
        integrity: "sha512-newer-codex",
        installPath: installDir,
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [
        {
          id: "codex",
          packageVersion: "9999.1.1",
          providers: ["codex", "openai-codex", "openai"],
        },
      ],
      diagnostics: [],
      byPluginId: new Map([
        [
          "codex",
          {
            id: "codex",
            packageVersion: "9999.1.1",
            providers: ["codex", "openai-codex", "openai"],
          },
        ],
      ]),
    });

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        agents: {
          defaults: {
            model: "openai/gpt-5.5",
          },
        },
      },
      env: {},
    });

    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(result).toEqual({ changes: [], warnings: [], records });
  });

  it.each([
    [
      "default OpenAI model route",
      {
        agents: {
          defaults: {
            model: "openai/gpt-5.5",
          },
        },
      },
      {},
    ],
    [
      "provider runtime policy",
      {
        models: {
          providers: {
            openai: {
              baseUrl: "https://api.openai.com/v1",
              agentRuntime: { id: "codex" },
              models: [],
            },
          },
        },
      },
      {},
    ],
    [
      "default model runtime policy",
      {
        agents: {
          defaults: {
            models: {
              "openai/gpt-5.5": { agentRuntime: { id: "codex" } },
            },
          },
        },
      },
      {},
    ],
    [
      "default selectable OpenAI agent model",
      {
        agents: {
          defaults: {
            model: { primary: "anthropic/claude-sonnet-4-6" },
            models: {
              "openai/gpt-5.5": {},
            },
          },
        },
      },
      {},
    ],
    [
      "agent model runtime policy",
      {
        agents: {
          list: [
            {
              id: "main",
              model: "anthropic/claude-opus-4-7",
              models: {
                "anthropic/claude-opus-4-7": { agentRuntime: { id: "codex" } },
              },
            },
          ],
        },
      },
      {},
    ],
  ])("repairs a missing Codex plugin selected by %s", async (_label, cfg, env) => {
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "codex",
        npmSpec: "@mangabaclaw/codex",
        version: "2026.5.2",
      }),
    );
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      {
        id: "codex",
        label: "Codex",
        install: {
          npmSpec: "@mangabaclaw/codex",
          defaultChoice: "npm",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg,
      env,
    });

    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedCodexInstallSpec(),
      expectedPluginId: "codex",
      trustedSourceLinkedOfficialInstall: true,
    });
    const records = mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords);
    expectRecordFields((records as Record<string, unknown>).codex, {
      source: "npm",
      spec: "@mangabaclaw/codex",
      installPath: "/tmp/mangabaclaw-plugins/codex",
      version: "2026.5.2",
    });
    expect(mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords, 0, 1)).toEqual({
      config: cfg,
      env,
    });
    expect(result.changes).toEqual([
      `Installed missing configured plugin "codex" from ${expectedCodexInstallSpec()}.`,
    ]);
    expect(result.warnings).toEqual([]);
    expect(Object.keys(result.records)).toEqual(["codex"]);
    expectRecordFields(result.records.codex, {
      source: "npm",
      spec: "@mangabaclaw/codex",
      installPath: "/tmp/mangabaclaw-plugins/codex",
      version: "2026.5.2",
      resolvedName: "@mangabaclaw/codex",
      resolvedSpec: "@mangabaclaw/codex@2026.5.2",
      integrity: "sha512-codex",
      resolvedAt: "2026-05-01T00:00:00.000Z",
    });
    expect(typeof result.records.codex?.installedAt).toBe("string");
  });

  it.each([
    [
      "default agent runtime",
      {
        agents: {
          defaults: {
            agentRuntime: { id: "codex" },
          },
        },
      },
      {},
    ],
    [
      "agent runtime override",
      {
        agents: {
          list: [{ id: "main", agentRuntime: { id: "codex" } }],
        },
      },
      {},
    ],
    ["environment runtime override", {}, { MANGABACLAW_AGENT_RUNTIME: "codex" }],
  ])("ignores legacy whole-agent Codex runtime selected by %s", async (_label, cfg, env) => {
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      {
        id: "codex",
        label: "Codex",
        install: {
          npmSpec: "@mangabaclaw/codex",
          defaultChoice: "npm",
        },
      },
    ]);

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg,
      env,
    });

    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(result).toEqual({ changes: [], warnings: [], records: {} });
  });

  it("does not install a blocked downloadable plugin from explicit channel ids", async () => {
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "matrix",
        pluginId: "matrix",
        meta: { label: "Matrix" },
        install: {
          npmSpec: "@mangabaclaw/plugin-matrix@1.2.3",
        },
      },
    ]);

    const { repairMissingPluginInstallsForIds } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingPluginInstallsForIds({
      cfg: {},
      pluginIds: [],
      channelIds: ["matrix"],
      blockedPluginIds: ["matrix"],
      env: {},
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(result).toEqual({ changes: [], warnings: [], records: {} });
  });

  it.each<{ name: string; plugins: PluginsConfig; installs: boolean }>([
    {
      name: "does not install a channel catalog plugin when a configured plugin already owns that channel",
      plugins: { entries: { "mangabaclaw-lark": { enabled: true } } },
      installs: false,
    },
    {
      name: "still installs a channel catalog plugin when the configured owner is blocked by the allowlist",
      plugins: {
        allow: ["some-other-plugin"],
        entries: { "mangabaclaw-lark": { enabled: true } },
      },
      installs: true,
    },
    {
      name: "still installs a channel catalog plugin when that plugin is explicitly configured",
      plugins: {
        entries: {
          feishu: { enabled: true },
          "mangabaclaw-lark": { enabled: true },
        },
      },
      installs: true,
    },
  ])("$name", async ({ plugins, installs }) => {
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [
        {
          id: "mangabaclaw-lark",
          origin: "config",
          channels: ["feishu"],
          channelConfigs: {
            feishu: {
              schema: {
                type: "object",
              },
            },
          },
        },
      ],
      diagnostics: [],
    });
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "feishu",
        pluginId: "feishu",
        meta: { label: "Feishu" },
        install: {
          npmSpec: "@mangabaclaw/feishu",
        },
        trustedSourceLinkedOfficialInstall: true,
      },
    ]);
    if (installs) {
      mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
        successfulInstall({
          pluginId: "feishu",
          npmSpec: "@mangabaclaw/feishu",
          version: "2026.5.2",
        }),
      );
    }

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins,
        channels: {
          feishu: { footer: { model: false } },
        },
      },
      env: {},
    });

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    if (!installs) {
      expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
      expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
      expect(result).toEqual({ changes: [], warnings: [], records: {} });
      return;
    }
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedNpmInstallSpec("@mangabaclaw/feishu"),
      expectedPluginId: "feishu",
      trustedSourceLinkedOfficialInstall: true,
    });
    expect(result.changes).toEqual([
      `Installed missing configured plugin "feishu" from ${expectedNpmInstallSpec("@mangabaclaw/feishu")}.`,
    ]);
  });

  it("reinstalls a missing configured plugin from its persisted install record", async () => {
    const records = {
      demo: {
        source: "npm",
        spec: "@mangabaclaw/plugin-demo@1.0.0",
        installPath: "/missing/demo",
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.updateNpmInstalledPlugins.mockResolvedValue({
      changed: true,
      config: {
        plugins: {
          installs: {
            demo: {
              source: "npm",
              spec: "@mangabaclaw/plugin-demo@1.0.0",
              installPath: "/tmp/mangabaclaw-plugins/demo",
            },
          },
        },
      },
      outcomes: [
        {
          pluginId: "demo",
          status: "updated",
          message: "Updated demo.",
        },
      ],
    });

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            demo: { enabled: true },
          },
        },
      },
      env: {},
    });

    const updateArg = expectRecordFields(mockCallArg(mocks.updateNpmInstalledPlugins), {
      pluginIds: ["demo"],
    });
    const updateConfig = updateArg.config as Record<string, unknown>;
    expectRecordFields(updateConfig.plugins, { installs: records });
    const persistedRecords = mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords);
    expectRecordFields((persistedRecords as Record<string, unknown>).demo, {
      installPath: "/tmp/mangabaclaw-plugins/demo",
    });
    expect(mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords, 0, 1)).toEqual({
      config: expect.any(Object),
      env: {},
    });
    expect(result.changes).toEqual(['Repaired missing configured plugin "demo".']);
  });

  it("forwards ClawHub risk acknowledgement to persisted-record repair", async () => {
    const records = {
      demo: {
        source: "clawhub",
        spec: "clawhub:@mangabaclaw/plugin-demo@1.0.0",
        clawhubPackage: "@mangabaclaw/plugin-demo",
        installPath: "/missing/demo",
      },
    };
    const onClawHubRisk = vi.fn(async () => true);
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.updateNpmInstalledPlugins.mockResolvedValue({
      changed: true,
      config: {
        plugins: {
          installs: {
            demo: {
              source: "clawhub",
              spec: "clawhub:@mangabaclaw/plugin-demo@1.0.0",
              installPath: "/tmp/mangabaclaw-plugins/demo",
            },
          },
        },
      },
      outcomes: [
        {
          pluginId: "demo",
          status: "updated",
          message: "Updated demo.",
        },
      ],
    });

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            demo: { enabled: true },
          },
        },
      },
      env: {},
      acknowledgeClawHubRisk: true,
      onClawHubRisk,
    });

    const updateArg = expectRecordFields(mockCallArg(mocks.updateNpmInstalledPlugins), {
      pluginIds: ["demo"],
      acknowledgeClawHubRisk: true,
      onClawHubRisk,
    });
    expect(updateArg.logger).toEqual(expect.objectContaining({ terminalLinks: false }));
    const updateConfig = updateArg.config as Record<string, unknown>;
    expectRecordFields(updateConfig.plugins, { installs: records });
  });

  it("keeps non-ClawHub updater warnings as persisted-record repair warnings", async () => {
    const records = {
      demo: {
        source: "npm",
        spec: "@mangabaclaw/plugin-demo@1.0.0",
        installPath: "/missing/demo",
      },
    };
    const repairWarning =
      'Could not repair mangabaclaw peer link for "demo" at /tmp/mangabaclaw-plugins/demo: permission denied';
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.updateNpmInstalledPlugins.mockImplementationOnce(
      async (params: {
        logger?: { warn?: (message: string) => void };
        config: Record<string, unknown>;
      }) => {
        params.logger?.warn?.(repairWarning);
        return {
          changed: true,
          config: {
            plugins: {
              installs: {
                demo: {
                  source: "npm",
                  spec: "@mangabaclaw/plugin-demo@1.0.0",
                  installPath: "/tmp/mangabaclaw-plugins/demo",
                },
              },
            },
          },
          outcomes: [
            {
              pluginId: "demo",
              status: "updated",
              message: "Updated demo.",
            },
          ],
        };
      },
    );

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            demo: { enabled: true },
          },
        },
      },
      env: {},
    });

    expect(result.warnings).toContain(repairWarning);
    expect(result.notices ?? []).not.toContain(repairWarning);
  });

  it("keeps ClawHub review notices non-fatal during persisted-record repair", async () => {
    const records = {
      demo: {
        source: "clawhub",
        spec: "clawhub:@mangabaclaw/plugin-demo@1.0.0",
        clawhubPackage: "@mangabaclaw/plugin-demo",
        installPath: "/missing/demo",
      },
    };
    const reviewNotice =
      "╭─ WARNING - ClawHub found security risks in this release ─╮\n" +
      "│ • Security scan:     suspicious                                      │\n" +
      "╰───────────────────────────────────────────────────────────────────────╯";
    const coloredReviewNotice = `\u001b[33m${reviewNotice}\u001b[39m`;
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.updateNpmInstalledPlugins.mockImplementationOnce(
      async (params: {
        logger?: { warn?: (message: string) => void };
        config: Record<string, unknown>;
      }) => {
        params.logger?.warn?.(coloredReviewNotice);
        return {
          changed: true,
          config: {
            plugins: {
              installs: {
                demo: {
                  source: "clawhub",
                  spec: "clawhub:@mangabaclaw/plugin-demo@1.0.0",
                  installPath: "/tmp/mangabaclaw-plugins/demo",
                },
              },
            },
          },
          outcomes: [
            {
              pluginId: "demo",
              status: "updated",
              message: "Updated demo.",
            },
          ],
        };
      },
    );

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            demo: { enabled: true },
          },
        },
      },
      env: {},
    });

    expect(result.notices).toContain(reviewNotice);
    expect(result.notices?.[0]).not.toContain("\u001b");
    expect(result.warnings).toStrictEqual([]);
  });

  it.each([
    {
      name: "adds actionable acknowledgement guidance for risky persisted ClawHub repair failures",
      spec: "clawhub:@mangabaclaw/plugin-demo@1.0.0",
      release: "@mangabaclaw/plugin-demo@1.0.0",
      expectedSpec: "clawhub:@mangabaclaw/plugin-demo@1.0.0",
    },
    {
      name: "prefixes legacy persisted ClawHub package records in acknowledgement guidance",
      release: "@mangabaclaw/plugin-demo@latest",
      expectedSpec: "clawhub:@mangabaclaw/plugin-demo",
    },
  ])("$name", async ({ spec, release, expectedSpec }) => {
    const records = {
      demo: {
        source: "clawhub",
        ...(spec ? { spec } : {}),
        clawhubPackage: "@mangabaclaw/plugin-demo",
        installPath: "/missing/demo",
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.updateNpmInstalledPlugins.mockResolvedValue({
      changed: false,
      config: { plugins: { installs: records } },
      outcomes: [
        {
          pluginId: "demo",
          status: "skipped",
          code: CLAWHUB_INSTALL_ERROR_CODE.CLAWHUB_RISK_ACKNOWLEDGEMENT_REQUIRED,
          message: `Skipped demo ClawHub update: ClawHub release "${release}" has trust warnings. Review the package and rerun with --acknowledge-clawhub-risk to continue. Existing installed plugin left unchanged.`,
        },
      ],
    });

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {
        plugins: {
          entries: {
            demo: { enabled: true },
          },
        },
      },
      env: {},
    });

    expect(result.warnings[0]).toContain(
      `mangabaclaw plugins install ${expectedSpec} --acknowledge-clawhub-risk`,
    );
  });

  it("repairs a broken managed package entry from its attributed registry diagnostic", async () => {
    const records = {
      demo: {
        source: "npm",
        spec: "@mangabaclaw/plugin-demo@1.0.0",
        resolvedName: "@mangabaclaw/plugin-demo",
        resolvedSpec: "@mangabaclaw/plugin-demo@1.0.0",
        resolvedVersion: "1.0.0",
        integrity: "sha512-demo",
        installPath: "/tmp/mangabaclaw-plugins/demo",
      },
    };
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [],
      diagnostics: [
        {
          level: "error",
          pluginId: "demo",
          message: "extension entry escapes package directory: ./index.ts",
        },
      ],
    });
    mocks.updateNpmInstalledPlugins.mockResolvedValue({
      changed: true,
      config: {
        plugins: {
          installs: {
            demo: {
              source: "npm",
              spec: "@mangabaclaw/plugin-demo@1.0.0",
              installPath: "/tmp/mangabaclaw-plugins/demo",
            },
          },
        },
      },
      outcomes: [
        {
          pluginId: "demo",
          status: "updated",
          message: "Updated demo.",
        },
      ],
    });

    const { repairMissingConfiguredPluginInstalls } =
      await import("./missing-configured-plugin-install.js");
    const result = await repairMissingConfiguredPluginInstalls({
      cfg: {},
      env: {},
    });

    const updateArg = expectRecordFields(mockCallArg(mocks.updateNpmInstalledPlugins), {
      pluginIds: ["demo"],
    });
    const updateConfig = updateArg.config as { plugins?: { installs?: Record<string, unknown> } };
    const updateRecord = expectRecordFields(updateConfig.plugins?.installs?.demo, {
      source: "npm",
      spec: "@mangabaclaw/plugin-demo@1.0.0",
      integrity: "sha512-demo",
      installPath: "/tmp/mangabaclaw-plugins/demo",
    });
    expect(updateRecord.resolvedSpec).toBeUndefined();
    expect(updateRecord.resolvedVersion).toBeUndefined();
    expect(result.changes).toEqual(['Repaired broken installed plugin "demo".']);
  });

  it("reinstalls a known configured plugin from the catalog when its recorded install path is missing", async () => {
    const records = installedRecords("discord", {
      spec: "@mangabaclaw/discord",
      installPath: "/tmp/mangabaclaw-missing-discord-install-record",
    });
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [
        {
          id: "discord",
          channels: ["discord"],
        },
      ],
      diagnostics: [],
    });
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      channelPluginEntry({
        id: "discord",
        npmSpec: "@mangabaclaw/discord",
        label: "Discord",
        trustedSourceLinkedOfficialInstall: true,
      }),
    ]);
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "discord",
        npmSpec: "@mangabaclaw/discord",
        version: "1.2.3",
      }),
    );
    mocks.updateNpmInstalledPlugins.mockResolvedValue({
      changed: false,
      config: {
        plugins: {
          installs: records,
        },
      },
      outcomes: [
        {
          pluginId: "discord",
          status: "skipped",
          message: "No update applied.",
        },
      ],
    });

    const result = await repairConfiguredPlugins({
      plugins: {
        entries: {
          discord: { enabled: true },
        },
      },
      channels: {
        discord: { enabled: true },
      },
    });

    const updateArg = expectRecordFields(mockCallArg(mocks.updateNpmInstalledPlugins), {
      pluginIds: ["discord"],
    });
    const updateConfig = updateArg.config as Record<string, unknown>;
    expectRecordFields(updateConfig.plugins, { installs: records });
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedNpmInstallSpec("@mangabaclaw/discord"),
      expectedPluginId: "discord",
      trustedSourceLinkedOfficialInstall: true,
    });
    const persistedRecords = mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords);
    expectRecordFields((persistedRecords as Record<string, unknown>).discord, {
      spec: "@mangabaclaw/discord",
      installPath: "/tmp/mangabaclaw-plugins/discord",
    });
    expect(mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords, 0, 1)).toEqual({
      config: expect.any(Object),
      env: {},
    });
    expect(result.changes).toEqual([
      `Installed missing configured plugin "discord" from ${expectedNpmInstallSpec("@mangabaclaw/discord")}.`,
    ]);
  });

  it("updates a known configured plugin when its installed manifest path still exists", async () => {
    const records = installedRecords("discord", {
      spec: "@mangabaclaw/discord",
      installPath: process.cwd(),
    });
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [
        {
          id: "discord",
          channels: ["discord"],
        },
      ],
      diagnostics: [
        {
          pluginId: "discord",
          message: "manifest without channelConfigs metadata",
        },
      ],
    });
    mocks.updateNpmInstalledPlugins.mockResolvedValue(
      successfulUpdate(
        "discord",
        installedRecords("discord", {
          spec: "@mangabaclaw/discord",
          installPath: process.cwd(),
        }),
      ),
    );

    const result = await repairConfiguredPlugins({
      plugins: {
        entries: {
          discord: { enabled: true },
        },
      },
      channels: {
        discord: { enabled: true },
      },
    });

    const updateArg = expectRecordFields(mockCallArg(mocks.updateNpmInstalledPlugins), {
      pluginIds: ["discord"],
    });
    const updateConfig = updateArg.config as Record<string, unknown>;
    expectRecordFields(updateConfig.plugins, { installs: records });
    const persistedRecords = mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords);
    expectRecordFields((persistedRecords as Record<string, unknown>).discord, {
      installPath: process.cwd(),
    });
    expect(mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords, 0, 1)).toEqual({
      config: expect.any(Object),
      env: {},
    });
    expect(result.changes).toEqual(['Repaired missing configured plugin "discord".']);
  });

  it("updates a configured plugin when its installed manifest lacks channel config descriptors", async () => {
    const records = installedRecords("discord", {
      spec: "@mangabaclaw/discord",
      installPath: "/tmp/mangabaclaw-plugins/discord",
    });
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.listChannelPluginCatalogEntries.mockReturnValue([
      channelPluginEntry({
        id: "discord",
        npmSpec: "@mangabaclaw/discord",
        label: "Discord",
      }),
    ]);
    mocks.loadPluginMetadataSnapshot.mockReturnValue({
      plugins: [
        {
          id: "discord",
          channels: ["discord"],
        },
      ],
      diagnostics: [
        {
          level: "warn",
          pluginId: "discord",
          message:
            "channel plugin manifest declares discord without channelConfigs metadata; add mangabaclaw.plugin.json#channelConfigs so config schema and setup surfaces work before runtime loads",
        },
      ],
    });
    mocks.updateNpmInstalledPlugins.mockResolvedValue(
      successfulUpdate(
        "discord",
        installedRecords("discord", {
          spec: "@mangabaclaw/discord",
          installPath: process.cwd(),
        }),
      ),
    );

    const result = await repairConfiguredPlugins({
      update: { channel: "beta" },
      plugins: {
        entries: {
          discord: { enabled: true },
        },
      },
      channels: {
        discord: { enabled: true },
      },
    });

    const updateArg = expectRecordFields(mockCallArg(mocks.updateNpmInstalledPlugins), {
      pluginIds: ["discord"],
      updateChannel: "beta",
    });
    const updateConfig = updateArg.config as Record<string, unknown>;
    expectRecordFields(updateConfig.plugins, { installs: records });
    const persistedRecords = mockCallArg(
      mocks.writePersistedInstalledPluginIndexInstallRecords,
    ) as Record<string, unknown>;
    expectRecordFields(persistedRecords.discord, { installPath: process.cwd() });
    expect(mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords, 0, 1)).toEqual({
      config: expect.any(Object),
      env: {},
    });
    expect(result).toEqual({
      changes: ['Repaired missing configured plugin "discord".'],
      warnings: [],
      repairedPluginIds: ["discord"],
      pluginInventoryChanged: true,
      records: installedRecords("discord", {
        spec: "@mangabaclaw/discord",
        installPath: process.cwd(),
      }),
    });
  });

  it("reinstalls a recorded external web search plugin from provider-only config", async () => {
    const records = installedRecords("brave", {
      spec: "@mangabaclaw/brave-plugin@beta",
      installPath: "/missing/brave",
    });
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      officialWebSearchPluginEntry({
        id: "brave",
        npmSpec: "@mangabaclaw/brave-plugin",
        envVar: "BRAVE_API_KEY",
        label: "Brave",
        providerLabel: "Brave Search",
      }),
    ]);
    mocks.updateNpmInstalledPlugins.mockResolvedValue(
      successfulUpdate(
        "brave",
        installedRecords("brave", {
          spec: "@mangabaclaw/brave-plugin@beta",
          installPath: process.cwd(),
        }),
      ),
    );

    const result = await repairConfiguredPlugins({
      tools: {
        web: {
          search: {
            provider: "brave",
          },
        },
      },
    });

    const updateArg = expectRecordFields(mockCallArg(mocks.updateNpmInstalledPlugins), {
      pluginIds: ["brave"],
    });
    const updateConfig = updateArg.config as Record<string, unknown>;
    expectRecordFields(updateConfig.plugins, { installs: records });
    const persistedRecords = mockCallArg(
      mocks.writePersistedInstalledPluginIndexInstallRecords,
    ) as Record<string, unknown>;
    expectRecordFields(persistedRecords.brave, { installPath: process.cwd() });
    expect(mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords, 0, 1)).toEqual({
      config: expect.any(Object),
      env: {},
    });
    expect(result.changes).toEqual(['Repaired missing configured plugin "brave".']);
  });

  it.each([
    {
      name: "replaces a configured official web search plugin when its installed package is source-only",
      pluginId: "brave",
      npmSpec: "@mangabaclaw/brave-plugin",
      priorSpec: "clawhub:@mangabaclaw/brave-plugin@2026.5.1-beta.1",
      targetDir: "/tmp/mangabaclaw-plugins/brave",
      cfg: { tools: { web: { search: { provider: "brave" } } } } satisfies MangabaClawConfig,
      catalogKind: "provider" as const,
    },
    {
      name: "replaces a configured official channel plugin when only its channel is configured",
      pluginId: "slack",
      npmSpec: "@mangabaclaw/slack",
      priorSpec: "clawhub:@mangabaclaw/slack@2026.5.12-beta.1",
      targetDir: "/tmp/mangabaclaw-npm/node_modules/@mangabaclaw/slack",
      cfg: { channels: { slack: { enabled: true, botToken: "xoxb-test" } } },
      catalogKind: "channel" as const,
    },
  ])("$name", async ({ pluginId, npmSpec, priorSpec, targetDir, cfg, catalogKind }) => {
    const extensionsDir = path.join(tempDirs.make("mangabaclaw-plugin-stub-repair-"), "extensions");
    const installDir = path.join(extensionsDir, pluginId);
    mocks.resolveDefaultPluginExtensionsDir.mockReturnValue(extensionsDir);
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, "package.json"), JSON.stringify({ name: pluginId }));
    const records = installedRecords(pluginId, {
      source: "clawhub",
      spec: priorSpec,
      installPath: installDir,
      clawhubPackage: npmSpec,
      clawhubChannel: "official",
      clawhubUrl: "https://clawhub.ai",
    });
    mocks.loadInstalledPluginIndexInstallRecords.mockResolvedValue(records);
    mocks.loadPluginMetadataSnapshot.mockReturnValue(brokenPluginSnapshot(pluginId));
    if (catalogKind === "provider") {
      mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
        officialWebSearchPluginEntry({
          id: pluginId,
          npmSpec,
          envVar: "BRAVE_API_KEY",
          label: "Brave",
          providerLabel: "Brave Search",
        }),
      ]);
    } else {
      mocks.listChannelPluginCatalogEntries.mockReturnValue([
        channelPluginEntry({
          id: pluginId,
          npmSpec,
          label: "Slack",
          trustedSourceLinkedOfficialInstall: true,
        }),
      ]);
    }
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({ pluginId, npmSpec, version: "2026.5.12", targetDir }),
    );

    const result = await repairConfiguredPlugins(cfg);

    expect(mocks.updateNpmInstalledPlugins).not.toHaveBeenCalled();
    expect(fs.existsSync(installDir)).toBe(false);
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedNpmInstallSpec(npmSpec),
      expectedPluginId: pluginId,
      trustedSourceLinkedOfficialInstall: true,
      mode: "update",
    });
    const persistedRecords = mockCallArg(
      mocks.writePersistedInstalledPluginIndexInstallRecords,
    ) as Record<string, unknown>;
    expectRecordFields(persistedRecords[pluginId], {
      source: "npm",
      spec: npmSpec,
      installPath: targetDir,
      version: "2026.5.12",
    });
    expect(result).toEqual({
      changes: [
        `Installed missing configured plugin "${pluginId}" from ${expectedNpmInstallSpec(npmSpec)}.`,
      ],
      warnings: [],
      repairedPluginIds: [pluginId],
      pluginInventoryChanged: true,
      records: persistedRecords,
    });
  });

  it("does not delete an arbitrary recorded path when replacing a broken official plugin", async () => {
    const installDir = tempDirs.make("mangabaclaw-plugin-stub-repair-");
    fs.writeFileSync(path.join(installDir, "package.json"), JSON.stringify({ name: "brave" }));
    mockBrokenBraveInstall(installDir, {
      source: "clawhub",
      spec: "clawhub:@mangabaclaw/brave-plugin@2026.5.1-beta.1",
      clawhubPackage: "@mangabaclaw/brave-plugin",
      clawhubChannel: "official",
      clawhubUrl: "https://clawhub.ai",
    });
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "brave",
        npmSpec: "@mangabaclaw/brave-plugin",
        version: "2026.5.12",
      }),
    );

    await repairConfiguredPlugins({
      tools: {
        web: {
          search: {
            provider: "brave",
          },
        },
      },
    });

    expect(fs.existsSync(installDir)).toBe(true);
    expect(mocks.installPluginFromNpmSpec).toHaveBeenCalled();
  });

  it("keeps a broken official install record when replacement install fails", async () => {
    const extensionsDir = path.join(tempDirs.make("mangabaclaw-plugin-stub-repair-"), "extensions");
    const installDir = path.join(extensionsDir, "brave");
    mocks.resolveDefaultPluginExtensionsDir.mockReturnValue(extensionsDir);
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, "package.json"), JSON.stringify({ name: "brave" }));
    const records = mockBrokenBraveInstall(installDir, {
      source: "clawhub",
      spec: "clawhub:@mangabaclaw/brave-plugin@2026.5.1-beta.1",
      clawhubPackage: "@mangabaclaw/brave-plugin",
      clawhubChannel: "official",
      clawhubUrl: "https://clawhub.ai",
    });
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce({
      ok: false,
      error: "network unavailable",
    });

    const result = await repairConfiguredPlugins({
      tools: {
        web: {
          search: {
            provider: "brave",
          },
        },
      },
    });

    expect(fs.existsSync(installDir)).toBe(true);
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(result).toEqual({
      changes: [],
      warnings: [
        `Failed to install missing configured plugin "brave" from ${expectedNpmInstallSpec("@mangabaclaw/brave-plugin")}: network unavailable`,
      ],
      failedPluginIds: ["brave"],
      records,
    });
  });

  it("does not replace a non-official install that collides with an official plugin id", async () => {
    const extensionsDir = path.join(tempDirs.make("mangabaclaw-plugin-stub-repair-"), "extensions");
    const installDir = path.join(extensionsDir, "brave");
    mocks.resolveDefaultPluginExtensionsDir.mockReturnValue(extensionsDir);
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, "package.json"), JSON.stringify({ name: "brave" }));
    const records = mockBrokenBraveInstall(installDir, {
      source: "path",
      sourcePath: installDir,
    });

    const result = await repairConfiguredPlugins({
      tools: {
        web: {
          search: {
            provider: "brave",
          },
        },
      },
    });

    expect(fs.existsSync(installDir)).toBe(true);
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.updateNpmInstalledPlugins).not.toHaveBeenCalled();
    expect(result).toEqual({
      changes: [],
      warnings: [],
      records,
    });
  });

  it("installs configured external speech and web-fetch plugins from selected providers", async () => {
    const packages = [
      ["firecrawl", "@mangabaclaw/firecrawl-plugin"],
      ["gradium", "@mangabaclaw/gradium-speech"],
      ["inworld", "@mangabaclaw/inworld-speech"],
    ] as const;
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue(
      packages.map(([id, npmSpec]) =>
        officialPluginEntry({
          id,
          npmSpec,
        }),
      ),
    );
    mocks.resolveOfficialExternalProviderContractPluginIds.mockImplementation(
      ({ contract }: { contract: string }) => {
        if (contract === "webFetchProviders") {
          return ["firecrawl"];
        }
        if (contract === "speechProviders") {
          return ["gradium", "inworld"];
        }
        return [];
      },
    );
    for (const [pluginId, npmSpec] of packages) {
      mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
        successfulInstall({ pluginId, npmSpec }),
      );
    }

    const result = await repairConfiguredPlugins({
      tts: {
        provider: "gradium",
        providers: {
          inworld: {},
        },
      },
      tools: {
        web: {
          fetch: {
            provider: "firecrawl",
          },
        },
      },
    });

    expect(
      mocks.installPluginFromNpmSpec.mock.calls.map(
        ([params]) => (params as { expectedPluginId?: string }).expectedPluginId,
      ),
    ).toEqual(["firecrawl", "gradium", "inworld"]);
    expect(result.changes).toEqual(
      packages.map(
        ([pluginId, npmSpec]) =>
          `Installed missing configured plugin "${pluginId}" from ${expectedNpmInstallSpec(npmSpec)}.`,
      ),
    );
  });

  it.each([
    {
      name: "installs missing configured non-channel plugins from the official external catalog",
      pluginId: "diagnostics-otel",
      npmSpec: "@mangabaclaw/diagnostics-otel",
      version: "2026.5.2",
      entry: {
        id: "diagnostics-otel",
        label: "Diagnostics OpenTelemetry",
        install: {
          clawhubSpec: "clawhub:@mangabaclaw/diagnostics-otel",
          npmSpec: "@mangabaclaw/diagnostics-otel",
          defaultChoice: "npm" as const,
        },
      },
      cfg: { plugins: { entries: { "diagnostics-otel": { enabled: true } } } },
      useManifestResolvers: false,
    },
    {
      name: "installs the official llama.cpp plugin for configured local memory embeddings",
      pluginId: "llama-cpp",
      npmSpec: "@mangabaclaw/llama-cpp-provider",
      version: "2026.6.2",
      entry: {
        id: "llama-cpp",
        label: "llama.cpp Provider",
        mangabaclaw: {
          plugin: { id: "llama-cpp", label: "llama.cpp Provider" },
          contracts: { embeddingProviders: ["local"] },
          install: {
            npmSpec: "@mangabaclaw/llama-cpp-provider",
            defaultChoice: "npm" as const,
          },
        },
        install: {
          npmSpec: "@mangabaclaw/llama-cpp-provider",
          defaultChoice: "npm" as const,
        },
      },
      cfg: { memory: { search: { provider: "local" } }, agents: { defaults: {} } },
      useManifestResolvers: false,
    },
    {
      name: "does not let runtime fallback metadata override official catalog install specs",
      pluginId: "acpx",
      npmSpec: "@mangabaclaw/acpx",
      version: "2026.5.2-beta.2",
      entry: {
        id: "acpx",
        label: "ACPX Runtime",
        install: { npmSpec: "@mangabaclaw/acpx", defaultChoice: "npm" as const },
      },
      cfg: { acp: { backend: "acpx" } },
      useManifestResolvers: false,
    },
    {
      name: "installs a configured external web search plugin from provider-only config",
      pluginId: "brave",
      npmSpec: "@mangabaclaw/brave-plugin",
      version: "2026.5.2",
      entry: officialWebSearchPluginEntry({
        id: "brave",
        npmSpec: "@mangabaclaw/brave-plugin",
        envVar: "BRAVE_API_KEY",
        label: "Brave",
        providerLabel: "Brave Search",
        credentialPath: "plugins.entries.brave.config.webSearch.apiKey",
        includeManifestInstall: true,
      }),
      cfg: { tools: { web: { search: { provider: "brave" } } } },
      useManifestResolvers: true,
    },
    {
      name: "installs a configured external model provider without an auth choice",
      pluginId: "groq",
      npmSpec: "@mangabaclaw/groq-provider",
      entry: officialPluginEntry({
        id: "groq",
        npmSpec: "@mangabaclaw/groq-provider",
        label: "Groq",
        manifest: { providers: [{ id: "groq" }] },
      }),
      cfg: {
        agents: { defaults: { model: "groq/llama-3.3-70b-versatile" } },
      } satisfies MangabaClawConfig,
      useManifestResolvers: false,
    },
    {
      name: "installs an external media-understanding provider selected only by media config",
      pluginId: "groq",
      npmSpec: "@mangabaclaw/groq-provider",
      entry: officialPluginEntry({
        id: "groq",
        npmSpec: "@mangabaclaw/groq-provider",
        label: "Groq",
        manifest: { contracts: { mediaUnderstandingProviders: ["groq"] } },
      }),
      cfg: {
        tools: {
          media: {
            models: [
              {
                provider: "groq",
                model: "whisper-large-v3-turbo",
                capabilities: ["audio"],
              },
            ],
          },
        },
      } satisfies MangabaClawConfig,
      useManifestResolvers: false,
    },
    {
      name: "installs an external speech provider selected only by voiceModel",
      pluginId: "gradium",
      npmSpec: "@mangabaclaw/gradium-speech",
      entry: officialPluginEntry({
        id: "gradium",
        npmSpec: "@mangabaclaw/gradium-speech",
        label: "Gradium",
        manifest: { contracts: { speechProviders: ["gradium"] } },
      }),
      cfg: {
        agents: { defaults: { voiceModel: { primary: "gradium/tts-default" } } },
      } satisfies MangabaClawConfig,
      useManifestResolvers: false,
    },
  ])("$name", async ({ pluginId, npmSpec, version, entry, cfg, useManifestResolvers }) => {
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([entry]);
    if (useManifestResolvers) {
      useManifestCatalogResolvers();
    }
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({ pluginId, npmSpec, version }),
    );

    const result = await repairConfiguredPlugins(cfg);

    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedNpmInstallSpec(npmSpec),
      expectedPluginId: pluginId,
      trustedSourceLinkedOfficialInstall: true,
    });
    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(result.changes).toEqual([
      `Installed missing configured plugin "${pluginId}" from ${expectedNpmInstallSpec(npmSpec)}.`,
    ]);
  });

  it("installs env-only web provider plugins before auto-detection", async () => {
    const packages = [
      ["exa", "@mangabaclaw/exa-plugin", "EXA_API_KEY"],
      ["firecrawl", "@mangabaclaw/firecrawl-plugin", "FIRECRAWL_API_KEY"],
    ] as const;
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue(
      packages.map(([id, npmSpec, envVar]) =>
        officialWebSearchPluginEntry({
          id,
          npmSpec,
          envVar,
          providerLabel: `${id} search`,
        }),
      ),
    );
    for (const [pluginId, npmSpec] of packages) {
      mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
        successfulInstall({ pluginId, npmSpec }),
      );
    }

    const result = await repairConfiguredPlugins(
      {},
      {
        EXA_API_KEY: "exa-key",
        FIRECRAWL_API_KEY: "firecrawl-key",
      },
    );

    expect(
      mocks.installPluginFromNpmSpec.mock.calls.map(
        ([params]) => (params as { expectedPluginId?: string }).expectedPluginId,
      ),
    ).toEqual(["exa", "firecrawl"]);
    expect(result.changes).toEqual(
      packages.map(
        ([pluginId, npmSpec]) =>
          `Installed missing configured plugin "${pluginId}" from ${expectedNpmInstallSpec(npmSpec)}.`,
      ),
    );
  });

  it("installs env-only provider plugins before model discovery", async () => {
    mocks.resolveOfficialExternalProviderPluginIdsForEnv.mockReturnValue(["groq"]);
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      officialPluginEntry({
        id: "groq",
        npmSpec: "@mangabaclaw/groq-provider",
        label: "Groq",
        manifest: {},
      }),
    ]);
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "groq",
        npmSpec: "@mangabaclaw/groq-provider",
      }),
    );

    const env = { GROQ_API_KEY: "groq-key" };
    const result = await repairConfiguredPlugins({}, env);

    expect(mocks.resolveOfficialExternalProviderPluginIdsForEnv).toHaveBeenCalledWith(env);
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedNpmInstallSpec("@mangabaclaw/groq-provider"),
      expectedPluginId: "groq",
      trustedSourceLinkedOfficialInstall: true,
    });
    expect(result.changes).toEqual([
      `Installed missing configured plugin "groq" from ${expectedNpmInstallSpec("@mangabaclaw/groq-provider")}.`,
    ]);
  });

  it("installs configured external web search plugins from beta on the beta channel", async () => {
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      officialWebSearchPluginEntry({
        id: "brave",
        npmSpec: "@mangabaclaw/brave-plugin",
        envVar: "BRAVE_API_KEY",
        label: "Brave",
        providerLabel: "Brave Search",
        credentialPath: "plugins.entries.brave.config.webSearch.apiKey",
        includeManifestInstall: true,
      }),
    ]);
    useManifestCatalogResolvers();
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "brave",
        npmSpec: "@mangabaclaw/brave-plugin",
        version: "2026.5.4-beta.1",
      }),
    );

    const result = await repairConfiguredPlugins({
      update: { channel: "beta" },
      tools: {
        web: {
          search: {
            provider: "brave",
          },
        },
      },
    });

    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: "@mangabaclaw/brave-plugin@beta",
      expectedPluginId: "brave",
      trustedSourceLinkedOfficialInstall: true,
    });
    const persistedRecords = mockCallArg(
      mocks.writePersistedInstalledPluginIndexInstallRecords,
    ) as Record<string, unknown>;
    expectRecordFields(persistedRecords.brave, {
      spec: "@mangabaclaw/brave-plugin",
    });
    expect(mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords, 0, 1)).toEqual({
      config: expect.any(Object),
      env: {},
    });
    expect(result.changes).toEqual([
      'Installed missing configured plugin "brave" from @mangabaclaw/brave-plugin@beta.',
    ]);
  });

  it("repairs a configured plugin from a legacy npm declaration stub", async () => {
    const root = tempDirs.make("mangabaclaw-plugin-stub-repair-");
    const pluginDir = path.join(root, "extensions", "guardrail-bridge");
    writeLegacyNpmDeclarationStub({
      pluginDir,
      pluginId: "guardrail-bridge",
      npmSpec: "@guardrail-bridge/guardrail-bridge@1.0.0",
    });
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "guardrail-bridge",
        npmSpec: "@guardrail-bridge/guardrail-bridge",
        version: "1.0.0",
        resolution: {
          resolvedSpec: "@guardrail-bridge/guardrail-bridge@1.0.0",
          integrity: "sha512-guardrail",
        },
      }),
    );

    const result = await repairConfiguredPlugins({
      plugins: {
        load: {
          paths: [pluginDir],
        },
        entries: {
          "guardrail-bridge": { enabled: true },
        },
      },
    });

    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: "@guardrail-bridge/guardrail-bridge@1.0.0",
      expectedPluginId: "guardrail-bridge",
      extensionsDir: "/tmp/mangabaclaw-plugins",
    });
    expect(mockCallArg(mocks.installPluginFromNpmSpec).trustedSourceLinkedOfficialInstall).toBe(
      undefined,
    );
    const records = mockCallArg(mocks.writePersistedInstalledPluginIndexInstallRecords);
    expectRecordFields((records as Record<string, unknown>)["guardrail-bridge"], {
      source: "npm",
      spec: "@guardrail-bridge/guardrail-bridge@1.0.0",
      installPath: "/tmp/mangabaclaw-plugins/guardrail-bridge",
      version: "1.0.0",
      resolvedName: "@guardrail-bridge/guardrail-bridge",
    });
    expect(result.changes).toEqual([
      'Installed missing configured plugin "guardrail-bridge" from @guardrail-bridge/guardrail-bridge@1.0.0.',
    ]);
    expect(result.warnings).toStrictEqual([]);
  });

  it("installs Firecrawl for env-only web fetch when search is disabled", async () => {
    mocks.resolveOfficialExternalWebProviderContractPluginIdsForEnv.mockReturnValue(["firecrawl"]);
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      officialPluginEntry({
        id: "firecrawl",
        npmSpec: "@mangabaclaw/firecrawl-plugin",
        label: "Firecrawl",
        manifest: {},
      }),
    ]);
    mocks.installPluginFromNpmSpec.mockResolvedValueOnce(
      successfulInstall({
        pluginId: "firecrawl",
        npmSpec: "@mangabaclaw/firecrawl-plugin",
      }),
    );

    const env = { FIRECRAWL_API_KEY: "firecrawl-key" };
    const result = await repairConfiguredPlugins(
      {
        tools: {
          web: {
            search: {
              enabled: false,
            },
          },
        },
      },
      env,
    );

    expect(mocks.resolveOfficialExternalWebProviderContractPluginIdsForEnv).toHaveBeenCalledWith({
      contract: "webFetchProviders",
      env,
    });
    expectRecordFields(mockCallArg(mocks.installPluginFromNpmSpec), {
      spec: expectedNpmInstallSpec("@mangabaclaw/firecrawl-plugin"),
      expectedPluginId: "firecrawl",
      trustedSourceLinkedOfficialInstall: true,
    });
    expect(result.changes).toEqual([
      `Installed missing configured plugin "firecrawl" from ${expectedNpmInstallSpec("@mangabaclaw/firecrawl-plugin")}.`,
    ]);
  });

  it("does not install a configured external web search plugin when search is disabled", async () => {
    mocks.listOfficialExternalPluginCatalogEntries.mockReturnValue([
      officialWebSearchPluginEntry({
        id: "brave",
        npmSpec: "@mangabaclaw/brave-plugin",
        envVar: "BRAVE_API_KEY",
        label: "Brave",
        providerLabel: "Brave Search",
        credentialPath: "plugins.entries.brave.config.webSearch.apiKey",
        includeManifestInstall: true,
      }),
    ]);
    useManifestCatalogResolvers();

    const result = await repairConfiguredPlugins(
      {
        tools: {
          web: {
            search: {
              enabled: false,
              provider: "brave",
            },
          },
        },
      },
      {
        BRAVE_API_KEY: "brave-key",
      },
    );

    expect(mocks.installPluginFromClawHub).not.toHaveBeenCalled();
    expect(mocks.installPluginFromNpmSpec).not.toHaveBeenCalled();
    expect(mocks.writePersistedInstalledPluginIndexInstallRecords).not.toHaveBeenCalled();
    expect(result).toEqual({ changes: [], warnings: [], records: {} });
  });
});
/* oxlint-disable max-lines -- TODO: split this grandfathered oversized file. */
