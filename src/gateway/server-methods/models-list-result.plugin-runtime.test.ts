import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelCatalogEntry, ModelCatalogSnapshot } from "../../agents/model-catalog.types.js";
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import { withMangabaClawTestState } from "../../test-utils/mangabaclaw-test-state.js";
import {
  buildModelsListResult,
  createGatewayAgentModelCatalogProjector,
} from "./models-list-result.js";
import type { GatewayRequestContext } from "./types.js";

const mocks = vi.hoisted(() => ({
  prepareHarnessCatalog: vi.fn(async (params: { snapshot: ModelCatalogSnapshot }) => ({
    snapshot: params.snapshot,
    defaultModel: undefined,
    catalog: params.snapshot.entries,
  })),
}));

vi.mock("./models-list-harness-catalog.js", () => ({
  prepareModelsListHarnessCatalog: mocks.prepareHarnessCatalog,
}));

function catalogEntry(id: string): ModelCatalogEntry {
  return { id, name: id, provider: "custom", api: "openai-responses" };
}

function preparedMetadataSnapshot() {
  return {
    index: {
      plugins: [
        {
          enabled: true,
          syntheticAuthRefs: ["custom"],
        },
      ],
    },
    plugins: [
      {
        modelIdNormalization: {
          providers: {
            custom: {
              aliases: {
                legacy: "modern",
              },
            },
          },
        },
      },
    ],
  } as never;
}

describe("models.list plugin metadata handoff", () => {
  beforeEach(() => {
    mocks.prepareHarnessCatalog.mockClear();
  });

  it("reuses one Gateway-owned metadata snapshot across startup projection and browse", async () => {
    await withMangabaClawTestState(
      {
        layout: "state-only",
        prefix: "mangabaclaw-models-list-plugin-runtime-",
        agentEnv: "main",
      },
      async (state) => {
        const cfg = {
          agents: {
            defaults: {
              workspace: state.workspaceDir,
              model: { primary: "custom/legacy" },
              models: {
                "custom/legacy": {},
                "custom/another": {},
              },
            },
          },
        } as MangabaClawConfig;
        const snapshot: ModelCatalogSnapshot = {
          entries: [catalogEntry("modern"), catalogEntry("another")],
          routeVariants: [],
        };
        const projector = createGatewayAgentModelCatalogProjector({
          cfg,
          agentId: "main",
          snapshot,
          metadataSnapshot: preparedMetadataSnapshot(),
          preparedAuthStore: { version: 1, profiles: {} },
        });
        await projector.projectCatalog();

        const context = {
          getRuntimeConfig: () => cfg,
          loadGatewayModelCatalogSnapshot: vi.fn(),
          logGateway: { debug: vi.fn() },
        } as unknown as GatewayRequestContext;
        await buildModelsListResult({
          context,
          agentId: "main",
          params: { view: "configured" },
          preloadedCatalog: { agentId: "main", config: cfg, snapshot },
          preloadedOnly: true,
          catalogProjector: projector,
        });
        expect(mocks.prepareHarnessCatalog).toHaveBeenCalledWith(
          expect.objectContaining({ allowHarnessDiscovery: false }),
        );
      },
    );
  });

  it("keeps prepared owner facts when preloaded-only browse requires full discovery", async () => {
    const cfg = {
      agents: { defaults: { models: { "custom/*": {} } } },
    } as MangabaClawConfig;
    const snapshot: ModelCatalogSnapshot = { entries: [], routeVariants: [] };
    const loadGatewayModelCatalogSnapshot = vi.fn();
    const context = {
      getRuntimeConfig: () => cfg,
      loadGatewayModelCatalogSnapshot,
      logGateway: { debug: vi.fn() },
    } as unknown as GatewayRequestContext;
    const projector = createGatewayAgentModelCatalogProjector({
      cfg,
      agentId: "main",
      snapshot,
      metadataSnapshot: preparedMetadataSnapshot(),
      preparedAuthStore: { version: 1, profiles: {} },
    });

    await buildModelsListResult({
      context,
      params: { view: "configured" },
      preloadedCatalog: { agentId: "main", config: cfg, snapshot },
      preloadedOnly: true,
      catalogProjector: projector,
    });

    expect(loadGatewayModelCatalogSnapshot).not.toHaveBeenCalled();
    expect(mocks.prepareHarnessCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ allowHarnessDiscovery: false }),
    );
  });

  it("discovers a harness catalog for an explicit configured picker read", async () => {
    const cfg = { agents: { defaults: { model: "custom/modern" } } } as MangabaClawConfig;
    const snapshot: ModelCatalogSnapshot = {
      entries: [catalogEntry("modern")],
      routeVariants: [],
    };
    const projector = createGatewayAgentModelCatalogProjector({
      cfg,
      agentId: "main",
      snapshot,
      metadataSnapshot: preparedMetadataSnapshot(),
      preparedAuthStore: { version: 1, profiles: {} },
    });
    const context = {
      getRuntimeConfig: () => cfg,
      loadGatewayModelCatalogSnapshot: vi.fn(),
      logGateway: { debug: vi.fn() },
    } as unknown as GatewayRequestContext;

    await buildModelsListResult({
      context,
      params: { view: "configured" },
      preloadedCatalog: { agentId: "main", config: cfg, snapshot },
      catalogProjector: projector,
    });

    expect(mocks.prepareHarnessCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ allowHarnessDiscovery: true, agentId: "main", snapshot }),
    );
  });
});
