// Covers managed plugin install path generation.
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveDefaultPluginExtensionsDir,
  resolveDefaultPluginGitDir,
  resolveDefaultPluginNpmDir,
  resolvePluginNpmGenerationProjectDir,
  resolvePluginNpmGenerationProjectDirPrefix,
} from "./install-paths.js";
import { resolvePluginInstallRoots, withPluginInstallRoots } from "./install-root-context.js";
import {
  resolveInstalledPluginIndexStateDatabaseOptions,
  resolveInstalledPluginIndexStorePath,
} from "./installed-plugin-index-store-path.js";

describe("plugin install root context", () => {
  it("keeps discovery roots on the operator install while runtime state is redirected", async () => {
    const operatorRoots = resolvePluginInstallRoots(
      { MANGABACLAW_STATE_DIR: "/operator/mangabaclaw" },
      () => "/unused-home",
    );
    const redirectedEnv = { MANGABACLAW_STATE_DIR: "/tmp/ephemeral-run" };

    await withPluginInstallRoots(operatorRoots, async () => {
      await Promise.resolve();
      expect(resolveDefaultPluginExtensionsDir(redirectedEnv)).toBe(
        "/operator/mangabaclaw/extensions",
      );
      expect(resolveDefaultPluginNpmDir(redirectedEnv)).toBe("/operator/mangabaclaw/npm");
      expect(resolveDefaultPluginGitDir(redirectedEnv)).toBe("/operator/mangabaclaw/git");
      expect(resolveInstalledPluginIndexStorePath({ env: redirectedEnv })).toBe(
        "/operator/mangabaclaw/state/mangabaclaw.sqlite",
      );
      expect(
        resolveInstalledPluginIndexStateDatabaseOptions({ env: redirectedEnv }).env
          ?.MANGABACLAW_STATE_DIR,
      ).toBe("/operator/mangabaclaw");
    });

    expect(resolveDefaultPluginExtensionsDir(redirectedEnv)).toBe("/tmp/ephemeral-run/extensions");
    expect(resolveInstalledPluginIndexStorePath({ env: redirectedEnv })).toBe(
      "/tmp/ephemeral-run/state/mangabaclaw.sqlite",
    );
    expect(
      resolveInstalledPluginIndexStateDatabaseOptions({ env: redirectedEnv }).env
        ?.MANGABACLAW_STATE_DIR,
    ).toBe("/tmp/ephemeral-run");
  });

  it("isolates concurrent install-root scopes", async () => {
    const resolveScopedRoot = async (stateDir: string) => {
      const roots = resolvePluginInstallRoots({ MANGABACLAW_STATE_DIR: stateDir });
      return await withPluginInstallRoots(roots, async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        return resolveDefaultPluginExtensionsDir({ MANGABACLAW_STATE_DIR: "/redirected" });
      });
    };

    await expect(
      Promise.all([resolveScopedRoot("/operator/one"), resolveScopedRoot("/operator/two")]),
    ).resolves.toEqual(["/operator/one/extensions", "/operator/two/extensions"]);
  });
});

describe("managed npm plugin install paths", () => {
  it("keeps generation project names compact for nested Windows runtime binaries", () => {
    const packageName = "@mangabaclaw/codex";
    const generationKey = [
      packageName,
      "2026.6.10",
      `${packageName}@2026.6.10`,
      "sha512-test-integrity",
      "codexshasum",
    ].join("\n");
    const projectDir = resolvePluginNpmGenerationProjectDir({
      npmDir: String.raw`C:\Users\Administrator\.mangabaclaw\npm`,
      packageName,
      generationKey,
    });
    const projectName = path.basename(projectDir);

    expect(projectName).toMatch(
      /^mangabaclaw-codex-[a-f0-9]{10}__mangabaclaw-generation__g-[a-f0-9]{16}$/u,
    );
    expect(projectName.length).toBeLessThanOrEqual(66);

    const nestedCodexBinaryPath = path.win32.join(
      String.raw`C:\Users\Administrator\.mangabaclaw\npm\projects`,
      projectName,
      "node_modules",
      "@mangabaclaw",
      "codex",
      "node_modules",
      "@openai",
      "codex-win32-x64",
      "vendor",
      "x86_64-pc-windows-msvc",
      "bin",
      "codex.exe",
    );
    expect(nestedCodexBinaryPath.length).toBeLessThan(260);
  });

  it("keeps generation project names under the recoverable package prefix", () => {
    const packageName = "@mangabaclaw/codex";
    const projectDir = resolvePluginNpmGenerationProjectDir({
      npmDir: "/tmp/mangabaclaw/npm",
      packageName,
      generationKey: "codex-v2",
    });

    expect(path.basename(projectDir)).toMatch(
      new RegExp(`^${resolvePluginNpmGenerationProjectDirPrefix(packageName)}`, "u"),
    );
  });
});
