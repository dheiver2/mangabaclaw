// Covers plugin discovery threading and concurrency behavior.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginDiscoveryResult } from "./discovery.js";
import * as installedPluginIndexRecordReader from "./installed-plugin-index-record-reader.js";

const discoverMangabaClawPluginsMock = vi.fn();

vi.mock("./discovery.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./discovery.js")>();
  return {
    ...actual,
    discoverMangabaClawPlugins: (...args: unknown[]) => discoverMangabaClawPluginsMock(...args),
  };
});

const { loadPluginManifestRegistryCore } = await import("./manifest-registry.js");
const { loadInstalledPluginIndexWithDiscovery } = await import("./installed-plugin-index.js");

const emptyDiscovery: PluginDiscoveryResult = { candidates: [], diagnostics: [] };

describe("discovery threading", () => {
  beforeEach(() => {
    discoverMangabaClawPluginsMock.mockReset();
    discoverMangabaClawPluginsMock.mockReturnValue(emptyDiscovery);
  });

  it("skips internal discoverMangabaClawPlugins when discovery is supplied", () => {
    loadPluginManifestRegistryCore({ discovery: emptyDiscovery });
    expect(discoverMangabaClawPluginsMock).not.toHaveBeenCalled();

    discoverMangabaClawPluginsMock.mockClear();
    loadInstalledPluginIndexWithDiscovery({ discovery: emptyDiscovery, installRecords: {} });
    expect(discoverMangabaClawPluginsMock).not.toHaveBeenCalled();
  });

  it("calls discoverMangabaClawPlugins when neither discovery nor candidates supplied", () => {
    loadPluginManifestRegistryCore({});
    expect(discoverMangabaClawPluginsMock).toHaveBeenCalledTimes(1);

    discoverMangabaClawPluginsMock.mockClear();
    loadInstalledPluginIndexWithDiscovery({ installRecords: {} });
    expect(discoverMangabaClawPluginsMock).toHaveBeenCalledTimes(1);
  });

  it("prefers explicit candidates over discovery when both are supplied", () => {
    loadPluginManifestRegistryCore({ candidates: [], diagnostics: [], discovery: emptyDiscovery });
    expect(discoverMangabaClawPluginsMock).not.toHaveBeenCalled();

    discoverMangabaClawPluginsMock.mockClear();
    loadInstalledPluginIndexWithDiscovery({
      candidates: [],
      discovery: emptyDiscovery,
      installRecords: {},
    });
    expect(discoverMangabaClawPluginsMock).not.toHaveBeenCalled();
  });

  it("preserves explicit candidate diagnostics without loading persisted install records", () => {
    const readInstallRecords = vi.spyOn(
      installedPluginIndexRecordReader,
      "loadInstalledPluginIndexInstallRecordsSync",
    );
    const diagnostics = [{ level: "warn" as const, message: "explicit candidate diagnostic" }];

    const result = loadInstalledPluginIndexWithDiscovery({
      candidates: [],
      diagnostics,
      installRecords: {},
    });

    expect(result.manifestRegistry.diagnostics).toEqual(diagnostics);
    expect(result.discovery).toBeUndefined();
    expect(readInstallRecords).not.toHaveBeenCalled();
    expect(discoverMangabaClawPluginsMock).not.toHaveBeenCalled();
  });
});
