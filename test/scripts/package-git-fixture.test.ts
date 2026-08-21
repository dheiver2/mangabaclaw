// Package git fixture tests cover package-derived Docker git install fixtures.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../helpers/temp-dir.js";

describe("package git fixture", () => {
  const tempDirs = useAutoCleanupTempDirTracker(afterEach);

  it("stages bundled ai runtime as a local file dependency", async () => {
    const root = tempDirs.make("mangabaclaw-package-git-fixture-");
    writeFileSync(path.join(root, ".gitignore"), "dist/\n");
    mkdirSync(path.join(root, "node_modules", "@mangabaclaw", "ai"), { recursive: true });
    writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify(
        {
          dependencies: { "@mangabaclaw/ai": "2026.6.11", chalk: "5.6.2" },
          bundleDependencies: ["@mangabaclaw/ai", "chalk"],
          scripts: {
            build: "node build.mjs",
            mangabaclaw: "node scripts/run-node.mjs",
          },
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      path.join(root, "node_modules", "@mangabaclaw", "ai", "package.json"),
      `${JSON.stringify({
        name: "@mangabaclaw/ai",
        version: "2026.6.11",
        type: "module",
        main: "./dist/index.mjs",
        exports: { ".": "./dist/index.mjs" },
        devDependencies: { "@mangabaclaw/normalization-core": "0.0.0-private" },
      })}\n`,
    );

    const result = spawnSync(
      process.execPath,
      ["scripts/e2e/lib/package-git-fixture.mjs", "prepare", root],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(readFileSync(path.join(root, ".gitignore"), "utf8").split(/\r?\n/u)).toEqual(
      expect.arrayContaining(["dist/", "node_modules", "**/node_modules/", "pnpm-lock.yaml"]),
    );
    const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    expect(packageJson.dependencies["@mangabaclaw/ai"]).toBe("file:.mangabaclaw-fixture/packages/ai");
    expect(packageJson.bundleDependencies).toEqual(["chalk"]);
    expect(packageJson.scripts).toEqual({
      build: "node build.mjs",
      mangabaclaw: "node mangabaclaw.mjs",
    });
    const relocatedAiPackage = JSON.parse(
      readFileSync(path.join(root, ".mangabaclaw-fixture", "packages", "ai", "package.json"), "utf8"),
    );
    expect(relocatedAiPackage).toMatchObject({
      name: "@mangabaclaw/ai",
      version: "2026.6.11",
      type: "module",
      main: "./dist/index.mjs",
      exports: { ".": "./dist/index.mjs" },
    });
    expect(relocatedAiPackage).not.toHaveProperty("devDependencies");

    mkdirSync(path.join(root, "node_modules", "chalk"), { recursive: true });
    writeFileSync(path.join(root, "node_modules", "chalk", "package.json"), "{}\n");
    mkdirSync(path.join(root, ".mangabaclaw-fixture", "packages", "ai", "node_modules", "zod"), {
      recursive: true,
    });
    writeFileSync(
      path.join(root, ".mangabaclaw-fixture", "packages", "ai", "node_modules", "zod", "package.json"),
      "{}\n",
    );
    writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    expect(spawnSync("git", ["init", "-q", root], { encoding: "utf8" }).status).toBe(0);
    expect(spawnSync("git", ["-C", root, "add", "-A"], { encoding: "utf8" }).status).toBe(0);
    const staged = spawnSync("git", ["-C", root, "diff", "--cached", "--name-only"], {
      encoding: "utf8",
    });
    expect(staged.status).toBe(0);
    expect(staged.stdout).not.toContain("node_modules");
    expect(staged.stdout).not.toContain("pnpm-lock.yaml");
  });

  it("uses the packed entrypoint without a bundled ai runtime", () => {
    const root = tempDirs.make("mangabaclaw-package-git-fixture-no-ai-");
    writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify(
        {
          dependencies: { chalk: "5.6.2" },
          scripts: {
            lint: "node lint.mjs",
            mangabaclaw: "node scripts/run-node.mjs",
          },
        },
        null,
        2,
      )}\n`,
    );

    const result = spawnSync(
      process.execPath,
      ["scripts/e2e/lib/package-git-fixture.mjs", "prepare", root],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    expect(packageJson).toMatchObject({
      dependencies: { chalk: "5.6.2" },
      scripts: {
        lint: "node lint.mjs",
        mangabaclaw: "node mangabaclaw.mjs",
      },
    });
    expect(packageJson.dependencies).not.toHaveProperty("@mangabaclaw/ai");
  });
});
