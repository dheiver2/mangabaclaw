// Verifies native plugin SDK resolver behavior and import aliases.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { clearPluginMetadataLifecycleCaches } from "./plugin-metadata-lifecycle.js";
import {
  installMangabaClawInternalCorePackageNativeResolver,
  installMangabaClawPluginSdkNativeResolver,
} from "./plugin-sdk-native-resolver.js";

type NativeEsmLazyImportProbe = {
  status: number | null;
  stderr: string;
  stdout: string;
};
let nativeEsmLazyImportProbe: NativeEsmLazyImportProbe;

function writeJsonFile(targetPath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFakeMangabaClawPackage(root: string): { distRoot: string; loaderModulePath: string } {
  writeJsonFile(path.join(root, "package.json"), {
    name: "mangabaclaw",
    type: "module",
    bin: {
      mangabaclaw: "./mangabaclaw.mjs",
    },
    exports: {
      "./cli-entry": "./dist/cli-entry.js",
      "./plugin-sdk/agent-runtime": "./dist/plugin-sdk/agent-runtime.js",
      "./plugin-sdk/channel-message": "./dist/plugin-sdk/channel-message.js",
      "./plugin-sdk/channel-outbound": "./dist/plugin-sdk/channel-outbound.js",
      "./plugin-sdk/source-only": "./dist/plugin-sdk/source-only.js",
    },
  });
  fs.writeFileSync(path.join(root, "mangabaclaw.mjs"), "#!/usr/bin/env node\n", "utf8");
  const distRoot = path.join(root, "dist");
  const pluginSdkDir = path.join(distRoot, "plugin-sdk");
  fs.mkdirSync(pluginSdkDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginSdkDir, "agent-runtime.js"),
    "export const agentRuntimeSource = import.meta.url;\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(pluginSdkDir, "channel-message.js"),
    ['export * from "./channel-outbound.js";', ""].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(pluginSdkDir, "channel-outbound.js"),
    ['export const defineChannelMessageAdapter = () => "adapter";', ""].join("\n"),
    "utf8",
  );
  const loaderModulePath = path.join(distRoot, "plugins", "loader.js");
  fs.mkdirSync(path.dirname(loaderModulePath), { recursive: true });
  fs.writeFileSync(loaderModulePath, "export default {};\n", "utf8");
  return { distRoot, loaderModulePath };
}

function writeExternalPluginEntry(root: string): string {
  writeJsonFile(path.join(root, "package.json"), {
    name: "external-plugin",
    type: "module",
  });
  const entry = path.join(root, "dist", "runtime-api.js");
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, "export default {};\n", "utf8");
  return entry;
}

function writeNormalizationCoreSource(root: string): string {
  const sourcePath = path.join(root, "packages", "normalization-core", "src", "string-coerce.ts");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "export const normalizeOptionalString = () => undefined;\n", "utf8");
  return sourcePath;
}

function writeInternalCorePackageSource(
  root: string,
  packageDir: string,
  sourceFile: string,
): string {
  const sourcePath = path.join(root, "packages", packageDir, "src", sourceFile);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "export {};\n", "utf8");
  return sourcePath;
}

function writeInternalCorePackageExports(
  root: string,
  packageDir: string,
  subpaths: readonly string[],
): void {
  writeJsonFile(path.join(root, "packages", packageDir, "package.json"), {
    name: `@mangabaclaw/${packageDir}`,
    exports: Object.fromEntries(
      subpaths.map((subpath) => {
        const exportKey = subpath ? `./${subpath}` : ".";
        const distFile = `./dist/${subpath || "index"}.mjs`;
        return [exportKey, { import: distFile, default: distFile }];
      }),
    ),
  });
}

function addFakePluginSdkDistExport(root: string, subpath: string): string {
  const packageJsonPath = path.join(root, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    exports: Record<string, string>;
  };
  const distPath = path.join(root, "dist", "plugin-sdk", `${subpath}.js`);
  packageJson.exports[`./plugin-sdk/${subpath}`] = `./dist/plugin-sdk/${subpath}.js`;
  writeJsonFile(packageJsonPath, packageJson);
  fs.writeFileSync(distPath, `export const ${subpath.replaceAll("-", "_")} = true;\n`, "utf8");
  return distPath;
}

function createInternalCoreAliasFixture(prefix: string): {
  coreSourceParent: string;
  loaderModulePath: string;
  moduleUrl: string;
  root: string;
  sourcePath: string;
} {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const { loaderModulePath } = writeFakeMangabaClawPackage(root);
  const sourcePath = writeInternalCorePackageSource(root, "markdown-core", "code-spans.ts");
  const coreSourceParent = path.join(root, "src", "host-probe.js");
  fs.mkdirSync(path.dirname(coreSourceParent), { recursive: true });
  fs.writeFileSync(coreSourceParent, "export default {};\n", "utf8");
  return {
    coreSourceParent,
    loaderModulePath,
    moduleUrl: pathToFileURL(loaderModulePath).href,
    root,
    sourcePath,
  };
}

describe("installMangabaClawInternalCorePackageNativeResolver", () => {
  it("shares one internal core alias scan between resolver installers", () => {
    const fixture = createInternalCoreAliasFixture("mangabaclaw-sdk-native-core-cache-");
    const externalPluginEntry = writeExternalPluginEntry(
      path.join(path.dirname(path.dirname(fixture.loaderModulePath)), "external-plugin"),
    );
    const existsSync = vi.spyOn(fs, "existsSync");

    try {
      installMangabaClawPluginSdkNativeResolver({
        modulePath: fixture.loaderModulePath,
        pluginModulePath: externalPluginEntry,
      });
      expect(existsSync).toHaveBeenCalledWith(fixture.sourcePath);

      existsSync.mockClear();
      const aliases = installMangabaClawInternalCorePackageNativeResolver({
        moduleUrl: fixture.moduleUrl,
      });

      expect(aliases).toContain("@mangabaclaw/markdown-core/code-spans");
      expect(existsSync).not.toHaveBeenCalled();
    } finally {
      existsSync.mockRestore();
    }
  });

  it("shares one internal core alias scan across importers from the same host package", () => {
    const fixture = createInternalCoreAliasFixture("mangabaclaw-sdk-native-core-shared-host-");
    const secondModulePath = path.join(
      path.dirname(fixture.loaderModulePath),
      "provider-policy.js",
    );
    fs.writeFileSync(secondModulePath, "export default {};\n", "utf8");
    const existsSync = vi.spyOn(fs, "existsSync");
    const readFileSync = vi.spyOn(fs, "readFileSync");

    try {
      installMangabaClawInternalCorePackageNativeResolver({ moduleUrl: fixture.moduleUrl });
      expect(existsSync).toHaveBeenCalledWith(fixture.sourcePath);

      existsSync.mockClear();
      readFileSync.mockClear();
      const secondModuleUrl = pathToFileURL(secondModulePath).href;
      const aliases = installMangabaClawInternalCorePackageNativeResolver({
        moduleUrl: secondModuleUrl,
      });

      expect(aliases).toContain("@mangabaclaw/markdown-core/code-spans");
      expect(existsSync).not.toHaveBeenCalledWith(fixture.sourcePath);
      expect(readFileSync).toHaveBeenCalledExactlyOnceWith(
        path.join(fixture.root, "package.json"),
        "utf8",
      );

      existsSync.mockClear();
      readFileSync.mockClear();
      installMangabaClawInternalCorePackageNativeResolver({ moduleUrl: secondModuleUrl });

      expect(existsSync).not.toHaveBeenCalled();
      expect(readFileSync).not.toHaveBeenCalled();
    } finally {
      readFileSync.mockRestore();
      existsSync.mockRestore();
    }
  });

  it("keeps internal core alias registration isolated between host modules", () => {
    const first = createInternalCoreAliasFixture("mangabaclaw-sdk-native-core-host-a-");
    const second = createInternalCoreAliasFixture("mangabaclaw-sdk-native-core-host-b-");
    const existsSync = vi.spyOn(fs, "existsSync");

    try {
      installMangabaClawInternalCorePackageNativeResolver({ moduleUrl: first.moduleUrl });
      existsSync.mockClear();

      installMangabaClawInternalCorePackageNativeResolver({ moduleUrl: second.moduleUrl });

      expect(existsSync).toHaveBeenCalledWith(second.sourcePath);
      expect(
        fs.realpathSync(
          createRequire(first.coreSourceParent).resolve("@mangabaclaw/markdown-core/code-spans"),
        ),
      ).toBe(fs.realpathSync(first.sourcePath));
      expect(
        fs.realpathSync(
          createRequire(second.coreSourceParent).resolve("@mangabaclaw/markdown-core/code-spans"),
        ),
      ).toBe(fs.realpathSync(second.sourcePath));
    } finally {
      existsSync.mockRestore();
    }
  });

  it("rescans internal core aliases after plugin metadata lifecycle invalidation", () => {
    const fixture = createInternalCoreAliasFixture("mangabaclaw-sdk-native-core-invalidation-");
    const existsSync = vi.spyOn(fs, "existsSync");

    try {
      installMangabaClawInternalCorePackageNativeResolver({ moduleUrl: fixture.moduleUrl });
      existsSync.mockClear();

      installMangabaClawInternalCorePackageNativeResolver({ moduleUrl: fixture.moduleUrl });
      expect(existsSync).not.toHaveBeenCalled();

      clearPluginMetadataLifecycleCaches();
      existsSync.mockClear();
      installMangabaClawInternalCorePackageNativeResolver({ moduleUrl: fixture.moduleUrl });

      expect(existsSync).toHaveBeenCalledWith(fixture.sourcePath);
    } finally {
      existsSync.mockRestore();
    }
  });
});

describe("installMangabaClawPluginSdkNativeResolver", () => {
  it("resolves installed plugin SDK imports to the dev source root", () => {
    const stableRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-stable-"));
    const devRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-dev-source-"));
    const { loaderModulePath } = writeFakeMangabaClawPackage(stableRoot);
    writeFakeMangabaClawPackage(devRoot);
    fs.mkdirSync(path.join(devRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(devRoot, "extensions"), { recursive: true });
    const externalPluginEntry = writeExternalPluginEntry(path.join(stableRoot, "external-plugin"));
    const previousDevSourceRoot = process.env.MANGABACLAW_DEV_SOURCE_ROOT;
    process.env.MANGABACLAW_DEV_SOURCE_ROOT = devRoot;

    try {
      const installedAliases = installMangabaClawPluginSdkNativeResolver({
        modulePath: loaderModulePath,
        pluginModulePath: externalPluginEntry,
      });

      expect(installedAliases).toContain("mangabaclaw/plugin-sdk/agent-runtime");
      const requireFromPlugin = createRequire(externalPluginEntry);
      expect(fs.realpathSync(requireFromPlugin.resolve("mangabaclaw/plugin-sdk/agent-runtime"))).toBe(
        fs.realpathSync(path.join(devRoot, "dist", "plugin-sdk", "agent-runtime.js")),
      );
    } finally {
      if (previousDevSourceRoot === undefined) {
        delete process.env.MANGABACLAW_DEV_SOURCE_ROOT;
      } else {
        process.env.MANGABACLAW_DEV_SOURCE_ROOT = previousDevSourceRoot;
      }
    }
  });

  it("resolves installed plugin SDK imports to an explicit dev source root", () => {
    const stableRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-stable-"));
    const devRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-dev-source-"));
    const { loaderModulePath } = writeFakeMangabaClawPackage(stableRoot);
    writeFakeMangabaClawPackage(devRoot);
    fs.mkdirSync(path.join(devRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(devRoot, "extensions"), { recursive: true });
    const externalPluginEntry = writeExternalPluginEntry(path.join(stableRoot, "external-plugin"));

    const installedAliases = installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: externalPluginEntry,
      devSourceRoot: devRoot,
    });

    expect(installedAliases).toContain("mangabaclaw/plugin-sdk/agent-runtime");
    const requireFromPlugin = createRequire(externalPluginEntry);
    expect(fs.realpathSync(requireFromPlugin.resolve("mangabaclaw/plugin-sdk/agent-runtime"))).toBe(
      fs.realpathSync(path.join(devRoot, "dist", "plugin-sdk", "agent-runtime.js")),
    );
  });

  it("updates native SDK aliases when the same plugin parent switches dev source roots", () => {
    const stableRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-stable-"));
    const devRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-dev-source-"));
    const { loaderModulePath } = writeFakeMangabaClawPackage(stableRoot);
    writeFakeMangabaClawPackage(devRoot);
    fs.mkdirSync(path.join(devRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(devRoot, "extensions"), { recursive: true });
    const externalPluginEntry = writeExternalPluginEntry(path.join(stableRoot, "external-plugin"));
    const requireFromPlugin = createRequire(externalPluginEntry);

    installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: externalPluginEntry,
    });
    expect(fs.realpathSync(requireFromPlugin.resolve("mangabaclaw/plugin-sdk/agent-runtime"))).toBe(
      fs.realpathSync(path.join(stableRoot, "dist", "plugin-sdk", "agent-runtime.js")),
    );

    installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: externalPluginEntry,
      devSourceRoot: devRoot,
    });

    expect(fs.realpathSync(requireFromPlugin.resolve("mangabaclaw/plugin-sdk/agent-runtime"))).toBe(
      fs.realpathSync(path.join(devRoot, "dist", "plugin-sdk", "agent-runtime.js")),
    );
  });

  it("removes stale native SDK aliases when a later dev root omits a subpath", () => {
    const stableRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-stable-"));
    const devRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-dev-source-"));
    const { loaderModulePath } = writeFakeMangabaClawPackage(stableRoot);
    writeFakeMangabaClawPackage(devRoot);
    const stableExtraPath = addFakePluginSdkDistExport(stableRoot, "stable-extra");
    fs.mkdirSync(path.join(devRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(devRoot, "extensions"), { recursive: true });
    const externalPluginEntry = writeExternalPluginEntry(path.join(stableRoot, "external-plugin"));
    const requireFromPlugin = createRequire(externalPluginEntry);

    installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: externalPluginEntry,
    });
    expect(fs.realpathSync(requireFromPlugin.resolve("mangabaclaw/plugin-sdk/stable-extra"))).toBe(
      fs.realpathSync(stableExtraPath),
    );

    installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: externalPluginEntry,
      devSourceRoot: devRoot,
    });

    expect(() => requireFromPlugin.resolve("mangabaclaw/plugin-sdk/stable-extra")).toThrow();
  });

  it("keeps native aliases on JS dist artifacts when source files exist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-source-resolver-"));
    const { loaderModulePath } = writeFakeMangabaClawPackage(root);
    const sourceChannelOutboundPath = path.join(root, "src", "plugin-sdk", "channel-outbound.ts");
    fs.mkdirSync(path.dirname(sourceChannelOutboundPath), { recursive: true });
    fs.writeFileSync(sourceChannelOutboundPath, "export const sourceOnly = true;\n", "utf8");
    const externalPluginEntry = writeExternalPluginEntry(path.join(root, "external-plugin"));

    const installedAliases = installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: externalPluginEntry,
      pluginSdkResolution: "src",
    });

    expect(installedAliases).toContain("mangabaclaw/plugin-sdk/channel-outbound");
    const requireFromPlugin = createRequire(externalPluginEntry);
    expect(fs.realpathSync(requireFromPlugin.resolve("mangabaclaw/plugin-sdk/channel-outbound"))).toBe(
      fs.realpathSync(path.join(root, "dist", "plugin-sdk", "channel-outbound.js")),
    );
  });

  it("lets built external plugins resolve MangabaClaw SDK subpaths with createRequire", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-resolver-"));
    const { distRoot, loaderModulePath } = writeFakeMangabaClawPackage(root);
    const externalPluginEntry = writeExternalPluginEntry(path.join(root, "external-plugin"));

    const distMode = fs.statSync(distRoot).mode;
    if (process.platform !== "win32") {
      fs.chmodSync(distRoot, 0o555);
    }

    try {
      const installedAliases = installMangabaClawPluginSdkNativeResolver({
        modulePath: loaderModulePath,
        pluginModulePath: externalPluginEntry,
        pluginSdkResolution: "dist",
      });

      expect(installedAliases).toContain("mangabaclaw/plugin-sdk/channel-outbound");
      expect(fs.existsSync(path.join(distRoot, "extensions"))).toBe(false);
      const requireFromPlugin = createRequire(externalPluginEntry);
      expect(
        fs.realpathSync(requireFromPlugin.resolve("mangabaclaw/plugin-sdk/channel-outbound")),
      ).toBe(fs.realpathSync(path.join(root, "dist", "plugin-sdk", "channel-outbound.js")));
      const sdk = requireFromPlugin("mangabaclaw/plugin-sdk/channel-outbound") as {
        defineChannelMessageAdapter?: () => string;
      };

      expect(sdk.defineChannelMessageAdapter?.()).toBe("adapter");
      expect(() => requireFromPlugin.resolve("mangabaclaw/not-plugin-sdk/channel-message")).toThrow();
    } finally {
      if (process.platform !== "win32") {
        fs.chmodSync(distRoot, distMode);
      }
    }
  });

  beforeAll(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-esm-resolver-"));
    const probePath = path.join(root, "probe.mjs");
    const resolverModuleUrl = pathToFileURL(
      path.join(process.cwd(), "src", "plugins", "plugin-sdk-native-resolver.ts"),
    ).href;
    fs.writeFileSync(
      probePath,
      [
        'import fs from "node:fs";',
        'import path from "node:path";',
        'import { pathToFileURL } from "node:url";',
        `import { installMangabaClawPluginSdkNativeResolver } from ${JSON.stringify(resolverModuleUrl)};`,
        `const root = ${JSON.stringify(root)};`,
        "const writeJson = (targetPath, value) => {",
        "  fs.mkdirSync(path.dirname(targetPath), { recursive: true });",
        '  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\\n`, "utf8");',
        "};",
        'writeJson(path.join(root, "package.json"), {',
        '  name: "mangabaclaw",',
        '  type: "module",',
        '  bin: { mangabaclaw: "./mangabaclaw.mjs" },',
        "  exports: {",
        '    "./plugin-sdk/channel-outbound": "./dist/plugin-sdk/channel-outbound.js",',
        "  },",
        "});",
        'fs.writeFileSync(path.join(root, "mangabaclaw.mjs"), "#!/usr/bin/env node\\n", "utf8");',
        'fs.mkdirSync(path.join(root, "dist", "plugin-sdk"), { recursive: true });',
        'fs.writeFileSync(path.join(root, "dist", "plugin-sdk", "channel-outbound.js"), "export const defineChannelMessageAdapter = () => \\"adapter\\";\\n", "utf8");',
        'const loaderModulePath = path.join(root, "dist", "plugins", "loader.js");',
        "fs.mkdirSync(path.dirname(loaderModulePath), { recursive: true });",
        'fs.writeFileSync(loaderModulePath, "export default {};\\n", "utf8");',
        'const pluginRoot = path.join(root, "external-plugin");',
        'writeJson(path.join(pluginRoot, "package.json"), { name: "external-plugin", type: "module" });',
        'const entryPath = path.join(pluginRoot, "dist", "runtime-api.js");',
        'const lazyPath = path.join(pluginRoot, "dist", "lazy.js");',
        "fs.mkdirSync(path.dirname(entryPath), { recursive: true });",
        "fs.writeFileSync(",
        "  entryPath,",
        '  "import { defineChannelMessageAdapter } from \\"mangabaclaw/plugin-sdk/channel-outbound\\"; export const eager = defineChannelMessageAdapter(); export const loadLazy = () => import(\\"./lazy.js\\");\\n",',
        '  "utf8",',
        ");",
        "fs.writeFileSync(",
        "  lazyPath,",
        '  "import { defineChannelMessageAdapter } from \\"mangabaclaw/plugin-sdk/channel-outbound\\"; export const lazy = defineChannelMessageAdapter();\\n",',
        '  "utf8",',
        ");",
        "installMangabaClawPluginSdkNativeResolver({",
        "  modulePath: loaderModulePath,",
        "  pluginModulePath: entryPath,",
        '  pluginSdkResolution: "dist",',
        "});",
        "const module = await import(pathToFileURL(entryPath).href);",
        "const lazy = await module.loadLazy();",
        "console.log(`${module.eager}:${lazy.lazy}`);",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(process.execPath, ["--import", "tsx", probePath], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    fs.rmSync(root, { recursive: true, force: true });
    nativeEsmLazyImportProbe = {
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  });

  it("keeps SDK aliases available for native ESM lazy imports", () => {
    expect(nativeEsmLazyImportProbe.stderr).toBe("");
    expect(nativeEsmLazyImportProbe.status).toBe(0);
    expect(nativeEsmLazyImportProbe.stdout.trim()).toBe("adapter:adapter");
  });

  it("does not resolve SDK aliases for parents outside registered plugin roots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-guard-"));
    const { loaderModulePath } = writeFakeMangabaClawPackage(root);
    const externalPluginEntry = writeExternalPluginEntry(path.join(root, "external-plugin"));
    const unrelatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-outside-"));
    const unrelatedEntry = path.join(unrelatedRoot, "runtime-api.js");
    fs.mkdirSync(path.dirname(unrelatedEntry), { recursive: true });
    fs.writeFileSync(unrelatedEntry, "export default {};\n", "utf8");

    installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: externalPluginEntry,
      pluginSdkResolution: "dist",
    });

    const requireFromPlugin = createRequire(externalPluginEntry);
    const requireFromOutside = createRequire(unrelatedEntry);
    expect(requireFromPlugin.resolve("mangabaclaw/plugin-sdk/channel-outbound")).toBeTruthy();
    expect(() => requireFromOutside.resolve("mangabaclaw/plugin-sdk/channel-outbound")).toThrow();
  });

  it("resolves internal core packages only for MangabaClaw-owned source parents", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-core-internal-"));
    const { loaderModulePath } = writeFakeMangabaClawPackage(root);
    const normalizationSource = writeNormalizationCoreSource(root);
    const booleanCoercionSource = writeInternalCorePackageSource(
      root,
      "normalization-core",
      "boolean-coercion.ts",
    );
    const resultSource = writeInternalCorePackageSource(root, "normalization-core", "result.ts");
    const agentIdSource = writeInternalCorePackageSource(root, "normalization-core", "agent-id.ts");
    writeInternalCorePackageExports(root, "normalization-core", [
      "agent-id",
      "boolean-coercion",
      "result",
      "string-coerce",
    ]);
    writeInternalCorePackageExports(root, "media-core", ["attachment-classify", "mime"]);
    const mediaMimeSource = writeInternalCorePackageSource(root, "media-core", "mime.ts");
    const mediaAttachmentClassifySource = writeInternalCorePackageSource(
      root,
      "media-core",
      "attachment-classify.ts",
    );
    const markdownCoreSource = writeInternalCorePackageSource(
      root,
      "markdown-core",
      "code-spans.ts",
    );
    const aiTransportsSource = writeInternalCorePackageSource(root, "ai", "transports.ts");
    const aiRuntimeSource = writeInternalCorePackageSource(
      root,
      "ai",
      path.join("internal", "runtime.ts"),
    );
    const aiResponsesPayloadPolicySource = writeInternalCorePackageSource(
      root,
      "ai",
      path.join("internal", "openai-responses-payload-policy.ts"),
    );
    const aiRetryAfterSource = writeInternalCorePackageSource(
      root,
      "ai",
      path.join("internal", "retry-after.ts"),
    );
    const acpCoreSource = writeInternalCorePackageSource(
      root,
      "acp-core",
      path.join("runtime", "types.ts"),
    );
    writeInternalCorePackageExports(root, "acp-core", ["runtime/types"]);
    const llmCoreSource = writeInternalCorePackageSource(root, "llm-core", "index.ts");
    const externalPluginEntry = writeExternalPluginEntry(path.join(root, "external-plugin"));
    const coreSourceParent = path.join(root, "src", "config", "plugin-web-search-config.ts");
    fs.mkdirSync(path.dirname(coreSourceParent), { recursive: true });
    fs.writeFileSync(coreSourceParent, "export default {};\n", "utf8");

    const installedAliases = installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: externalPluginEntry,
      pluginSdkResolution: "dist",
    });

    expect(installedAliases).toContain("@mangabaclaw/normalization-core/string-coerce");
    expect(installedAliases).toContain("@mangabaclaw/normalization-core/boolean-coercion");
    expect(installedAliases).toContain("@mangabaclaw/normalization-core/result");
    expect(installedAliases).toContain("@mangabaclaw/normalization-core/agent-id");
    expect(installedAliases).toContain("@mangabaclaw/media-core/mime");
    expect(installedAliases).toContain("@mangabaclaw/media-core/attachment-classify");
    expect(installedAliases).toContain("@mangabaclaw/markdown-core/code-spans");
    expect(installedAliases).toContain("@mangabaclaw/ai/transports");
    expect(installedAliases).toContain("@mangabaclaw/ai/internal/openai-responses-payload-policy");
    expect(installedAliases).toContain("@mangabaclaw/ai/internal/retry-after");
    expect(installedAliases).toContain("@mangabaclaw/ai/internal/runtime");
    expect(installedAliases).toContain("@mangabaclaw/acp-core/runtime/types");
    expect(installedAliases).toContain("@mangabaclaw/llm-core");
    const requireFromCoreSource = createRequire(coreSourceParent);
    const requireFromPlugin = createRequire(externalPluginEntry);
    expect(
      fs.realpathSync(requireFromCoreSource.resolve("@mangabaclaw/normalization-core/string-coerce")),
    ).toBe(fs.realpathSync(normalizationSource));
    expect(
      fs.realpathSync(
        requireFromCoreSource.resolve("@mangabaclaw/normalization-core/boolean-coercion"),
      ),
    ).toBe(fs.realpathSync(booleanCoercionSource));
    expect(
      fs.realpathSync(requireFromCoreSource.resolve("@mangabaclaw/normalization-core/result")),
    ).toBe(fs.realpathSync(resultSource));
    expect(
      fs.realpathSync(requireFromCoreSource.resolve("@mangabaclaw/normalization-core/agent-id")),
    ).toBe(fs.realpathSync(agentIdSource));
    expect(fs.realpathSync(requireFromCoreSource.resolve("@mangabaclaw/media-core/mime"))).toBe(
      fs.realpathSync(mediaMimeSource),
    );
    expect(
      fs.realpathSync(requireFromCoreSource.resolve("@mangabaclaw/media-core/attachment-classify")),
    ).toBe(fs.realpathSync(mediaAttachmentClassifySource));
    expect(
      fs.realpathSync(requireFromCoreSource.resolve("@mangabaclaw/markdown-core/code-spans")),
    ).toBe(fs.realpathSync(markdownCoreSource));
    expect(fs.realpathSync(requireFromCoreSource.resolve("@mangabaclaw/ai/transports"))).toBe(
      fs.realpathSync(aiTransportsSource),
    );
    expect(
      fs.realpathSync(
        requireFromCoreSource.resolve("@mangabaclaw/ai/internal/openai-responses-payload-policy"),
      ),
    ).toBe(fs.realpathSync(aiResponsesPayloadPolicySource));
    expect(
      fs.realpathSync(requireFromCoreSource.resolve("@mangabaclaw/ai/internal/retry-after")),
    ).toBe(fs.realpathSync(aiRetryAfterSource));
    expect(fs.realpathSync(requireFromCoreSource.resolve("@mangabaclaw/ai/internal/runtime"))).toBe(
      fs.realpathSync(aiRuntimeSource),
    );
    expect(fs.realpathSync(requireFromCoreSource.resolve("@mangabaclaw/acp-core/runtime/types"))).toBe(
      fs.realpathSync(acpCoreSource),
    );
    expect(fs.realpathSync(requireFromCoreSource.resolve("@mangabaclaw/llm-core"))).toBe(
      fs.realpathSync(llmCoreSource),
    );
    expect(() => requireFromPlugin.resolve("@mangabaclaw/normalization-core/string-coerce")).toThrow();
    expect(() =>
      requireFromPlugin.resolve("@mangabaclaw/normalization-core/boolean-coercion"),
    ).toThrow();
    expect(() => requireFromPlugin.resolve("@mangabaclaw/normalization-core/result")).toThrow();
    expect(() => requireFromPlugin.resolve("@mangabaclaw/media-core/mime")).toThrow();
    expect(() => requireFromPlugin.resolve("@mangabaclaw/media-core/attachment-classify")).toThrow();
    expect(() => requireFromPlugin.resolve("@mangabaclaw/markdown-core/code-spans")).toThrow();
    expect(() => requireFromPlugin.resolve("@mangabaclaw/ai/transports")).toThrow();
    expect(() =>
      requireFromPlugin.resolve("@mangabaclaw/ai/internal/openai-responses-payload-policy"),
    ).toThrow();
    expect(() => requireFromPlugin.resolve("@mangabaclaw/ai/internal/retry-after")).toThrow();
    expect(() => requireFromPlugin.resolve("@mangabaclaw/ai/internal/runtime")).toThrow();
    expect(() => requireFromPlugin.resolve("@mangabaclaw/acp-core/runtime/types")).toThrow();
    expect(() => requireFromPlugin.resolve("@mangabaclaw/llm-core")).toThrow();
  });

  it("does not register source-only SDK subpaths for native resolution", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-source-only-"));
    const { loaderModulePath } = writeFakeMangabaClawPackage(root);
    const sourceOnlyPath = path.join(root, "src", "plugin-sdk", "source-only.ts");
    fs.mkdirSync(path.dirname(sourceOnlyPath), { recursive: true });
    fs.writeFileSync(sourceOnlyPath, "export const sourceOnly = true;\n", "utf8");
    const externalPluginEntry = writeExternalPluginEntry(path.join(root, "external-plugin"));

    const installedAliases = installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: externalPluginEntry,
      pluginSdkResolution: "src",
    });

    expect(installedAliases).toContain("mangabaclaw/plugin-sdk/channel-outbound");
    expect(installedAliases).not.toContain("mangabaclaw/plugin-sdk/source-only");
    const requireFromPlugin = createRequire(externalPluginEntry);
    expect(() => requireFromPlugin.resolve("mangabaclaw/plugin-sdk/source-only")).toThrow();
  });

  it("scopes private SSRF SDK aliases to bundled local IPC native parents", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-sdk-native-ssrf-"));
    const { loaderModulePath } = writeFakeMangabaClawPackage(root);
    const internalPath = path.join(root, "dist", "plugin-sdk", "ssrf-runtime-internal.js");
    fs.writeFileSync(internalPath, "export const ssrfInternal = true;\n", "utf8");
    const ollamaEntry = path.join(root, "dist", "extensions", "ollama", "index.js");
    const runtimeOllamaEntry = path.join(root, "dist-runtime", "extensions", "ollama", "index.js");
    const browserEntry = path.join(root, "dist", "extensions", "browser", "index.js");
    const runtimeBrowserEntry = path.join(
      root,
      "dist-runtime",
      "extensions",
      "browser",
      "index.js",
    );
    const otherEntry = path.join(root, "dist", "extensions", "demo", "index.js");
    fs.mkdirSync(path.dirname(ollamaEntry), { recursive: true });
    fs.mkdirSync(path.dirname(runtimeOllamaEntry), { recursive: true });
    fs.mkdirSync(path.dirname(browserEntry), { recursive: true });
    fs.mkdirSync(path.dirname(runtimeBrowserEntry), { recursive: true });
    fs.mkdirSync(path.dirname(otherEntry), { recursive: true });
    fs.writeFileSync(ollamaEntry, "export default {};\n", "utf8");
    fs.writeFileSync(runtimeOllamaEntry, "export default {};\n", "utf8");
    fs.writeFileSync(browserEntry, "export default {};\n", "utf8");
    fs.writeFileSync(runtimeBrowserEntry, "export default {};\n", "utf8");
    fs.writeFileSync(otherEntry, "export default {};\n", "utf8");

    const installedAliases = installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: ollamaEntry,
      pluginSdkResolution: "dist",
    });
    installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: runtimeOllamaEntry,
      pluginSdkResolution: "dist",
    });
    installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: browserEntry,
      pluginSdkResolution: "dist",
    });
    installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: runtimeBrowserEntry,
      pluginSdkResolution: "dist",
    });
    installMangabaClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: otherEntry,
      pluginSdkResolution: "dist",
    });

    expect(installedAliases).toContain("mangabaclaw/plugin-sdk/ssrf-runtime-internal");
    const requireFromOllama = createRequire(ollamaEntry);
    expect(
      fs.realpathSync(requireFromOllama.resolve("mangabaclaw/plugin-sdk/ssrf-runtime-internal")),
    ).toBe(fs.realpathSync(internalPath));

    const requireFromRuntimeOllama = createRequire(runtimeOllamaEntry);
    expect(
      fs.realpathSync(
        requireFromRuntimeOllama.resolve("mangabaclaw/plugin-sdk/ssrf-runtime-internal"),
      ),
    ).toBe(fs.realpathSync(internalPath));

    const requireFromBrowser = createRequire(browserEntry);
    expect(
      fs.realpathSync(requireFromBrowser.resolve("mangabaclaw/plugin-sdk/ssrf-runtime-internal")),
    ).toBe(fs.realpathSync(internalPath));

    const requireFromRuntimeBrowser = createRequire(runtimeBrowserEntry);
    expect(
      fs.realpathSync(
        requireFromRuntimeBrowser.resolve("mangabaclaw/plugin-sdk/ssrf-runtime-internal"),
      ),
    ).toBe(fs.realpathSync(internalPath));

    const requireFromOther = createRequire(otherEntry);
    expect(() => requireFromOther.resolve("mangabaclaw/plugin-sdk/ssrf-runtime-internal")).toThrow();
  });
});
