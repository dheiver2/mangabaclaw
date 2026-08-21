// Covers plugin peer linking for development installs.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditMangabaClawPeerDependenciesInManagedNpmRoot,
  linkMangabaClawPeerDependencies,
  reconcileRegisteredMangabaClawHostLinks,
  relinkMangabaClawPeerDependenciesInManagedNpmRoot,
} from "./plugin-peer-link.js";
import { cleanupTrackedTempDirs, makeTrackedTempDir } from "./test-helpers/fs-fixtures.js";

const tempDirs: string[] = [];

afterEach(() => {
  cleanupTrackedTempDirs(tempDirs);
});

function makeTempDir() {
  return makeTrackedTempDir("mangabaclaw-plugin-peer-link", tempDirs);
}

describe("plugin peer links", () => {
  it("relinks mangabaclaw peers in the managed npm root", async () => {
    const npmRoot = makeTempDir();
    const packageDir = path.join(npmRoot, "node_modules", "peer-plugin");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify({
        name: "peer-plugin",
        version: "1.0.0",
        peerDependencies: {
          mangabaclaw: ">=2026.0.0",
        },
      }),
      "utf8",
    );

    const messages: string[] = [];
    const result = await relinkMangabaClawPeerDependenciesInManagedNpmRoot({
      npmRoot,
      logger: {
        info: (message) => messages.push(message),
        warn: (message) => messages.push(message),
      },
    });

    const linkPath = path.join(packageDir, "node_modules", "mangabaclaw");
    expect(result).toEqual({ checked: 1, attempted: 1, repaired: 1, skipped: 0 });
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(linkPath)).toBe(fs.realpathSync(process.cwd()));
    expect(messages.join("\n")).toContain('Linked peerDependency "mangabaclaw"');
  });

  it("relinks mangabaclaw runtime dependencies in the managed npm root", async () => {
    const npmRoot = makeTempDir();
    const packageDir = path.join(npmRoot, "node_modules", "runtime-plugin");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify({
        name: "runtime-plugin",
        version: "1.0.0",
        dependencies: {
          mangabaclaw: "2026.7.1",
        },
      }),
      "utf8",
    );

    const result = await relinkMangabaClawPeerDependenciesInManagedNpmRoot({
      npmRoot,
      logger: {},
    });

    const linkPath = path.join(packageDir, "node_modules", "mangabaclaw");
    expect(result).toEqual({ checked: 1, attempted: 1, repaired: 1, skipped: 0 });
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(linkPath)).toBe(fs.realpathSync(process.cwd()));
  });

  it("reports one unreadable package and continues repairing its sibling", async () => {
    const npmRoot = makeTempDir();
    const unreadableDir = path.join(npmRoot, "node_modules", "bad-plugin");
    const peerDir = path.join(npmRoot, "node_modules", "peer-plugin");
    fs.mkdirSync(unreadableDir, { recursive: true });
    fs.mkdirSync(peerDir, { recursive: true });
    fs.writeFileSync(path.join(unreadableDir, "package.json"), "{", "utf8");
    fs.writeFileSync(
      path.join(peerDir, "package.json"),
      JSON.stringify({
        name: "peer-plugin",
        peerDependencies: { mangabaclaw: ">=2026.0.0" },
      }),
      "utf8",
    );
    const failures: Array<{ error: unknown; packageDir: string }> = [];

    const result = await relinkMangabaClawPeerDependenciesInManagedNpmRoot({
      npmRoot,
      logger: {},
      onPackageReadError: (error, packageDir) => failures.push({ error, packageDir }),
    });

    expect(result).toEqual({ checked: 1, attempted: 1, repaired: 1, skipped: 1 });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.packageDir).toBe(unreadableDir);
    expect(failures[0]?.error).toBeInstanceOf(SyntaxError);
    expect(fs.lstatSync(path.join(peerDir, "node_modules", "mangabaclaw")).isSymbolicLink()).toBe(
      true,
    );
  });

  it("reports one unreadable package and continues auditing its sibling", async () => {
    const npmRoot = makeTempDir();
    const unreadableDir = path.join(npmRoot, "node_modules", "bad-plugin");
    const peerDir = path.join(npmRoot, "node_modules", "peer-plugin");
    fs.mkdirSync(unreadableDir, { recursive: true });
    fs.mkdirSync(peerDir, { recursive: true });
    fs.writeFileSync(path.join(unreadableDir, "package.json"), "{", "utf8");
    fs.writeFileSync(
      path.join(peerDir, "package.json"),
      JSON.stringify({
        name: "peer-plugin",
        peerDependencies: { mangabaclaw: ">=2026.0.0" },
      }),
      "utf8",
    );
    const failures: Array<{ error: unknown; packageDir: string }> = [];

    const result = await auditMangabaClawPeerDependenciesInManagedNpmRoot({
      npmRoot,
      onPackageReadError: (error, packageDir) => failures.push({ error, packageDir }),
    });

    expect(result.checked).toBe(1);
    expect(result.broken).toBe(1);
    expect(result.issues[0]?.packageName).toBe("peer-plugin");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.packageDir).toBe(unreadableDir);
  });

  it("audits missing managed npm mangabaclaw peer links without relinking", async () => {
    const npmRoot = makeTempDir();
    const packageDir = path.join(npmRoot, "node_modules", "peer-plugin");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify({
        name: "peer-plugin",
        version: "1.0.0",
        peerDependencies: {
          mangabaclaw: ">=2026.0.0",
        },
      }),
      "utf8",
    );

    const result = await auditMangabaClawPeerDependenciesInManagedNpmRoot({ npmRoot });

    const linkPath = path.join(packageDir, "node_modules", "mangabaclaw");
    expect(result.checked).toBe(1);
    expect(result.broken).toBe(1);
    expect(result.issues[0]?.packageName).toBe("peer-plugin");
    expect(result.issues[0]?.reason).toContain(linkPath);
    expect(fs.existsSync(linkPath)).toBe(false);
  });

  it.runIf(process.platform !== "win32")(
    "does not follow a package-local node_modules symlink while linking mangabaclaw peers",
    async () => {
      const root = makeTempDir();
      const packageDir = path.join(root, "peer-plugin");
      const outsideDir = path.join(root, "outside-node-modules");
      fs.mkdirSync(packageDir, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });
      fs.symlinkSync(outsideDir, path.join(packageDir, "node_modules"), "dir");

      const warnings: string[] = [];
      const result = await linkMangabaClawPeerDependencies({
        installedDir: packageDir,
        peerDependencies: {
          mangabaclaw: ">=2026.0.0",
        },
        logger: {
          warn: (message) => warnings.push(message),
        },
      });

      expect(result).toEqual({ repaired: 0, skipped: 1 });
      expect(fs.existsSync(path.join(outsideDir, "mangabaclaw"))).toBe(false);
      expect(warnings.join("\n")).toContain("is not a real directory");
    },
  );

  it("replaces an existing real mangabaclaw package directory", async () => {
    const root = makeTempDir();
    const packageDir = path.join(root, "peer-plugin");
    const existingMangabaClawDir = path.join(packageDir, "node_modules", "mangabaclaw");
    fs.mkdirSync(existingMangabaClawDir, { recursive: true });
    fs.writeFileSync(path.join(existingMangabaClawDir, "package.json"), '{"name":"mangabaclaw"}', "utf8");

    const messages: string[] = [];
    const result = await linkMangabaClawPeerDependencies({
      installedDir: packageDir,
      peerDependencies: {
        mangabaclaw: ">=2026.0.0",
      },
      logger: {
        info: (message) => messages.push(message),
      },
    });

    expect(result).toEqual({ repaired: 1, skipped: 0 });
    expect(fs.lstatSync(existingMangabaClawDir).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(existingMangabaClawDir)).toBe(fs.realpathSync(process.cwd()));
    expect(messages.join("\n")).toContain('Linked peerDependency "mangabaclaw"');
  });

  it("does not delete an unrelated existing package directory", async () => {
    const root = makeTempDir();
    const packageDir = path.join(root, "peer-plugin");
    const existingMangabaClawDir = path.join(packageDir, "node_modules", "mangabaclaw");
    fs.mkdirSync(existingMangabaClawDir, { recursive: true });
    fs.writeFileSync(
      path.join(existingMangabaClawDir, "package.json"),
      '{"name":"not-mangabaclaw"}',
      "utf8",
    );

    const warnings: string[] = [];
    const result = await linkMangabaClawPeerDependencies({
      installedDir: packageDir,
      peerDependencies: {
        mangabaclaw: ">=2026.0.0",
      },
      logger: {
        warn: (message) => warnings.push(message),
      },
    });

    expect(result).toEqual({ repaired: 0, skipped: 1 });
    expect(fs.existsSync(path.join(existingMangabaClawDir, "package.json"))).toBe(true);
    expect(warnings.join("\n")).toContain("already exists and is not a symlink");
  });

  it.runIf(process.platform !== "win32")(
    "does not follow a registered plugin manifest symlink outside its package root",
    async () => {
      const root = makeTempDir();
      const extensionsDir = path.join(root, "extensions");
      const packageDir = path.join(extensionsDir, "email");
      const staleHostDir = path.join(packageDir, "node_modules", "mangabaclaw");
      const outsideManifest = path.join(root, "outside-package.json");
      fs.mkdirSync(staleHostDir, { recursive: true });
      fs.writeFileSync(
        outsideManifest,
        JSON.stringify({ name: "email", peerDependencies: { mangabaclaw: "*" } }),
      );
      fs.symlinkSync(outsideManifest, path.join(packageDir, "package.json"), "file");
      fs.writeFileSync(path.join(staleHostDir, "package.json"), '{"name":"mangabaclaw"}');
      const failures: Array<{ error: unknown; packageDir: string }> = [];

      const result = await reconcileRegisteredMangabaClawHostLinks({
        extensionsDir,
        installRecords: { email: { source: "npm", installPath: packageDir } },
        mode: "repair",
        onPackageReadError: (error, failedPackageDir) => {
          failures.push({ error, packageDir: failedPackageDir });
        },
      });

      expect(result.repaired).toBe(0);
      expect(result.skipped).toBe(1);
      expect(failures[0]?.packageDir).toBe(packageDir);
      expect(fs.lstatSync(staleHostDir).isDirectory()).toBe(true);
    },
  );

  it.runIf(process.platform !== "win32")(
    "repairs a registered npm plugin when the operator-owned extensions root is a symlink",
    async () => {
      const root = makeTempDir();
      const realExtensionsDir = path.join(root, "real-extensions");
      const extensionsDir = path.join(root, "extensions");
      fs.mkdirSync(realExtensionsDir, { recursive: true });
      fs.symlinkSync(realExtensionsDir, extensionsDir, "dir");
      const packageDir = path.join(extensionsDir, "email");
      const staleHostDir = path.join(packageDir, "node_modules", "mangabaclaw");
      fs.mkdirSync(staleHostDir, { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "package.json"),
        JSON.stringify({ name: "email", dependencies: { mangabaclaw: "2026.7.1" } }),
      );
      fs.writeFileSync(path.join(staleHostDir, "package.json"), '{"name":"mangabaclaw"}');

      const result = await reconcileRegisteredMangabaClawHostLinks({
        extensionsDir,
        installRecords: { email: { source: "npm", installPath: packageDir } },
        mode: "repair",
      });

      expect(result.repaired).toBe(1);
      expect(fs.lstatSync(staleHostDir).isSymbolicLink()).toBe(true);
      expect(fs.realpathSync(staleHostDir)).toBe(fs.realpathSync(process.cwd()));
    },
  );

  it.runIf(process.platform !== "win32")(
    "does not follow a registered plugin node_modules symlink outside its package root",
    async () => {
      const root = makeTempDir();
      const extensionsDir = path.join(root, "extensions");
      const packageDir = path.join(extensionsDir, "email");
      const outsideModules = path.join(root, "outside-node-modules");
      const outsideHost = path.join(outsideModules, "mangabaclaw");
      fs.mkdirSync(packageDir, { recursive: true });
      fs.mkdirSync(outsideHost, { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "package.json"),
        JSON.stringify({ name: "email", peerDependencies: { mangabaclaw: "*" } }),
      );
      fs.writeFileSync(path.join(outsideHost, "package.json"), '{"name":"mangabaclaw"}');
      fs.symlinkSync(outsideModules, path.join(packageDir, "node_modules"), "dir");
      const warnings: string[] = [];

      const result = await reconcileRegisteredMangabaClawHostLinks({
        extensionsDir,
        installRecords: { email: { source: "npm", installPath: packageDir } },
        mode: "repair",
        logger: { warn: (message) => warnings.push(message) },
      });

      expect(result.repaired).toBe(0);
      expect(result.skipped).toBe(1);
      expect(fs.lstatSync(outsideHost).isDirectory()).toBe(true);
      expect(warnings.join("\n")).toContain("is not a real directory");
    },
  );
});
