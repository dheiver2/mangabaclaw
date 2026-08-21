import type {
  MangabaClawPluginNodeHostCommand,
  MangabaClawPluginNodeInvokePolicy,
} from "mangabaclaw/plugin-sdk/plugin-entry";
import { createTestPluginApi } from "mangabaclaw/plugin-sdk/plugin-test-api";
import { createPluginRuntimeMock } from "mangabaclaw/plugin-sdk/plugin-test-runtime";
import type { SessionCatalogProvider } from "mangabaclaw/plugin-sdk/session-catalog";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("acpx Pi session catalog lazy imports", () => {
  afterEach(() => {
    vi.doUnmock("./src/pi-session-catalog-runtime.js");
    vi.resetModules();
  });

  it("loads catalog and node handlers only on first use", async () => {
    let runtimeImports = 0;
    vi.doMock("./src/pi-session-catalog-runtime.js", () => {
      runtimeImports += 1;
      return {
        createPiSessionCatalogRuntime: () => ({
          list: async () => [],
          read: async () => ({ hostId: "gateway", threadId: "", items: [] }),
          continueSession: async () => ({ sessionKey: "agent:main:test" }),
          checkUpstreamActivity: async () => [],
          openTerminal: async () => ({ kind: "local", argv: ["pi"] }),
        }),
        listPiSessions: async () => ({ sessions: [] }),
        readPiSession: async () => ({ hostId: "gateway", threadId: "", items: [] }),
        requireLocalPiSession: async () => ({ threadId: "test", cwd: "/tmp" }),
      };
    });

    const { default: acpxPlugin } = await import("./index.js");
    const catalogs: SessionCatalogProvider[] = [];
    const nodeCommands: MangabaClawPluginNodeHostCommand[] = [];
    const nodePolicies: MangabaClawPluginNodeInvokePolicy[] = [];
    acpxPlugin.register(
      createTestPluginApi({
        id: "acpx",
        name: "ACPX",
        source: "test",
        config: {},
        runtime: createPluginRuntimeMock(),
        registerSessionCatalog: (provider) => catalogs.push(provider),
        registerNodeHostCommand: (command) => nodeCommands.push(command),
        registerNodeInvokePolicy: (policy) => nodePolicies.push(policy),
      }),
    );

    expect(runtimeImports).toBe(0);
    expect(catalogs).toHaveLength(1);
    expect(nodeCommands).toHaveLength(3);
    expect(nodePolicies).toHaveLength(1);

    await expect(catalogs[0]?.list({ agentId: "main" })).resolves.toEqual([]);
    await expect(catalogs[0]?.list({ agentId: "main" })).resolves.toEqual([]);
    await expect(nodeCommands[0]?.handle()).resolves.toBe('{"sessions":[]}');
    await expect(nodeCommands[0]?.handle()).resolves.toBe('{"sessions":[]}');
    expect(runtimeImports).toBe(1);
  });
});
