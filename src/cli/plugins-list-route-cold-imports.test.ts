// The default plugin inventory route must render manifest facts without executing plugin code.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it, vi } from "vitest";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import {
  createColdPluginFixture,
  isColdPluginRuntimeLoaded,
} from "../plugins/test-helpers/cold-plugin-fixtures.js";

const testState = vi.hoisted(() => ({
  config: {} as MangabaClawConfig,
  loadedModules: new Set<string>(),
  logs: [] as string[],
}));

vi.mock("./command-execution-startup.js", () => ({
  applyCliExecutionStartupPresentation: vi.fn(async () => {}),
  ensureCliExecutionBootstrap: vi.fn(async () => {}),
  resolveCliExecutionStartupContext: vi.fn(() => ({
    startupPolicy: { loadPlugins: false, suppressDoctorStdout: true },
  })),
}));

vi.mock("../config/config.js", () => ({
  getRuntimeConfig: () => testState.config,
}));

vi.mock("../runtime.js", () => ({
  defaultRuntime: {
    error: vi.fn(),
    exit: vi.fn(),
    log: (...args: unknown[]) => testState.logs.push(args.map(String).join(" ")),
    writeJson: vi.fn(),
    writeStdout: vi.fn(),
  },
  writeRuntimeJson: vi.fn(),
}));

vi.mock("./plugins-cli.js", () => {
  testState.loadedModules.add("plugins-cli");
  return { registerPluginsCli: vi.fn() };
});

vi.mock("../plugins/loader-module-runtime.js", () => {
  testState.loadedModules.add("plugin-module-runtime");
  return {};
});

import { tryRouteCli } from "./route.js";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-plugins-list-route-"));

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it("renders the default list from metadata without loading plugin modules", async () => {
  const pluginRoot = path.join(tempRoot, "route-demo");
  fs.mkdirSync(pluginRoot, { recursive: true });
  const fixture = createColdPluginFixture({
    rootDir: pluginRoot,
    pluginId: "route-demo",
    packageName: "@example/route-demo",
    packageVersion: "4.2.0",
    manifest: {
      name: "Route Demo",
      description: "Prepared inventory metadata",
    },
  });
  const bundledRoot = path.join(tempRoot, "bundled");
  fs.mkdirSync(bundledRoot, { recursive: true });
  vi.stubEnv("MANGABACLAW_BUNDLED_PLUGINS_DIR", bundledRoot);
  vi.stubEnv("MANGABACLAW_DISABLE_BUNDLED_PLUGINS", "1");
  vi.stubEnv("MANGABACLAW_HOME", path.join(tempRoot, "home"));
  vi.stubEnv("MANGABACLAW_STATE_DIR", path.join(tempRoot, "state"));
  testState.config = {
    plugins: {
      load: { paths: [pluginRoot] },
      entries: { "route-demo": { enabled: true } },
    },
  };

  await expect(tryRouteCli(["node", "mangabaclaw", "plugins", "list"])).resolves.toBe(true);

  const output = testState.logs.join("\n");
  expect(output).toContain("Route Demo");
  expect(output).toContain("route-demo");
  expect(output).toContain("Prepared inventory metadata");
  expect(output).toContain("4.2.0");
  expect(isColdPluginRuntimeLoaded(fixture)).toBe(false);
  expect(testState.loadedModules).not.toContain("plugin-module-runtime");
  expect(testState.loadedModules).not.toContain("plugins-cli");
});
