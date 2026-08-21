// Proves startup update discovery through the real extended-stable registry resolver.
import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeMangabaClawStateDatabaseForTest } from "../state/mangabaclaw-state-db.js";
import {
  createMangabaClawTestState,
  type MangabaClawTestState,
} from "../test-utils/mangabaclaw-test-state.js";
import type { UpdateCheckResult } from "./update-check.js";

vi.mock("./mangabaclaw-root.js", async () => {
  const actual = await vi.importActual<typeof import("./mangabaclaw-root.js")>("./mangabaclaw-root.js");
  return {
    ...actual,
    resolveMangabaClawPackageRoot: vi.fn(async () => "/opt/mangabaclaw"),
  };
});

vi.mock("./update-check.js", async () => {
  const actual = await vi.importActual<typeof import("./update-check.js")>("./update-check.js");
  return {
    ...actual,
    checkUpdateStatus: vi.fn(
      async () =>
        ({
          root: "/opt/mangabaclaw",
          installKind: "package",
          packageManager: "npm",
        }) satisfies UpdateCheckResult,
    ),
  };
});

vi.mock("../version.js", () => ({
  VERSION: "1.0.0",
}));

describe("extended-stable startup update integration", () => {
  let testState: MangabaClawTestState;
  let server: http.Server | undefined;

  beforeEach(async () => {
    server = undefined;
    testState = await createMangabaClawTestState({
      layout: "state-only",
      prefix: "mangabaclaw-update-startup-integration-",
      env: {
        NODE_ENV: "test",
        NPM_CONFIG_REGISTRY: undefined,
        MANGABACLAW_UPDATE_PACKAGE_SPEC: undefined,
        VITEST: undefined,
      },
    });
  });

  afterEach(async () => {
    const activeServer = server;
    if (activeServer) {
      await new Promise<void>((resolve, reject) => {
        activeServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
    closeMangabaClawStateDatabaseForTest();
    await testState.cleanup();
  });

  it("emits a read-only hint after verifying a newer exact loopback package", async () => {
    const requests: string[] = [];
    const registryServer = http.createServer((request, response) => {
      requests.push(request.url ?? "");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ version: "2.0.0" }));
    });
    server = registryServer;
    await new Promise<void>((resolve) => {
      registryServer.listen(0, "127.0.0.1", resolve);
    });
    const address = registryServer.address();
    if (!address || typeof address === "string") {
      throw new Error("expected loopback registry address");
    }
    process.env.MANGABACLAW_UPDATE_PACKAGE_SPEC = "mangabaclaw";
    process.env.NPM_CONFIG_REGISTRY = `http://127.0.0.1:${address.port}/`;

    const { runGatewayUpdateCheck, resetUpdateAvailableStateForTest } =
      await import("./update-startup.js");
    resetUpdateAvailableStateForTest();
    const log = { info: vi.fn() };
    const onUpdateAvailableChange = vi.fn();
    const runAutoUpdate = vi.fn();

    await runGatewayUpdateCheck({
      cfg: { update: { channel: "extended-stable", auto: { enabled: true } } },
      log,
      isNixMode: false,
      allowInTests: true,
      onUpdateAvailableChange,
      runAutoUpdate,
    });

    expect(requests).toEqual(["/mangabaclaw/extended-stable", "/mangabaclaw/2.0.0"]);
    expect(onUpdateAvailableChange).toHaveBeenCalledWith({
      currentVersion: "1.0.0",
      latestVersion: "2.0.0",
      channel: "extended-stable",
    });
    expect(log.info).toHaveBeenCalledWith(
      "update available (extended-stable): v2.0.0 (current v1.0.0). Run: mangabaclaw update",
    );
    expect(runAutoUpdate).not.toHaveBeenCalled();
  });
});
