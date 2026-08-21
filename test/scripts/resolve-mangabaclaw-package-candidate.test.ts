// Resolve Mangabaclaw Package Candidate tests cover resolve mangabaclaw package candidate script behavior.
import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { toErrorObject as toLintErrorObject } from "@mangabaclaw/normalization-core/error-coercion";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertExpectedSha256ForTest,
  cleanupPackageSourceWorktreeForTest,
  cleanPackedMangabaClawTarballsForTest,
  downloadUrl,
  findSingleTarballForTest,
  loadTrustedPackageSource,
  moveNewestPackedTarballForTest,
  parseArgs,
  readArtifactPackageCandidateMetadata,
  readPackageBuildSourceSha,
  resolveNpmPackageCandidatePackRunner,
  runCommandForTest,
  validateMangabaClawPackageSpec,
} from "../../scripts/resolve-mangabaclaw-package-candidate.mts";

const tempDirs: string[] = [];

type LookupAddress = { address: string; family: number };

function lookupAddresses(addresses: LookupAddress[]) {
  return async () => addresses;
}

function unexpectedFetch(): never {
  throw new Error("downloadUrl should reject before fetching");
}

async function missing(file: string): Promise<boolean> {
  return await access(file).then(
    () => false,
    () => true,
  );
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForFile(filePath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) {
      return;
    }
    await sleep(5);
  }
  throw new Error(`timeout waiting for ${filePath}`);
}

async function waitForDead(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await sleep(5);
  }
  throw new Error(`process still alive: ${pid}`);
}

async function waitForExit(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<{ signal: NodeJS.Signals | null; status: number | null }> {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("timeout waiting for child exit")),
      timeoutMs,
    );
    child.on("close", (status, signal) => {
      clearTimeout(timeout);
      resolve({ signal, status });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("resolve-mangabaclaw-package-candidate", () => {
  it("allows Unreleased notes when packaging an exact ref candidate", () => {
    const script = readFileSync("scripts/resolve-mangabaclaw-package-candidate.mts", "utf8");
    const refPackageBuild = script.slice(
      script.indexOf('if (options.source === "ref")'),
      script.indexOf('} else if (options.source === "npm")'),
    );

    expect(refPackageBuild).toContain('"scripts/package-mangabaclaw-for-docker.mjs"');
    expect(refPackageBuild).toContain('"--allow-unreleased-changelog"');
  });

  it("accepts only MangabaClaw release package specs for npm candidates", () => {
    for (const spec of [
      "mangabaclaw@beta",
      "mangabaclaw@alpha",
      "mangabaclaw@extended-stable",
      "mangabaclaw@latest",
      "mangabaclaw@2026.4.27",
      "mangabaclaw@2026.4.27-1",
      "mangabaclaw@2026.4.27-beta.2",
      "mangabaclaw@2026.4.27-alpha.2",
    ]) {
      expect(validateMangabaClawPackageSpec(spec), spec).toBeUndefined();
    }

    expect(() => validateMangabaClawPackageSpec("@evil/mangabaclaw@1.0.0")).toThrow(
      "package_spec must be mangabaclaw@alpha",
    );
    expect(() => validateMangabaClawPackageSpec("mangabaclaw@canary")).toThrow(
      "package_spec must be mangabaclaw@alpha",
    );
    expect(() => validateMangabaClawPackageSpec("mangabaclaw@2026.04.27")).toThrow(
      "package_spec must be mangabaclaw@alpha",
    );
    expect(() => validateMangabaClawPackageSpec("mangabaclaw@npm:other-package")).toThrow(
      "package_spec must be mangabaclaw@alpha",
    );
    expect(() => validateMangabaClawPackageSpec("mangabaclaw@file:../other-package.tgz")).toThrow(
      "package_spec must be mangabaclaw@alpha",
    );
  });

  it("parses optional empty workflow inputs without rejecting the command line", () => {
    expect(
      parseArgs([
        "--source",
        "npm",
        "--package-ref",
        "release/2026.4.27",
        "--package-spec",
        "mangabaclaw@beta",
        "--package-url",
        "",
        "--package-sha256",
        "",
        "--artifact-dir",
        ".",
        "--output-dir",
        ".artifacts/docker-e2e-package",
      ]),
    ).toEqual({
      artifactDir: ".",
      githubOutput: "",
      metadata: "",
      outputDir: ".artifacts/docker-e2e-package",
      outputName: "mangabaclaw-current.tgz",
      packageSha256: "",
      packageRef: "release/2026.4.27",
      packageSpec: "mangabaclaw@beta",
      packageUrl: "",
      pluginRegistryOutputDir: "",
      requiredPluginPackagesJson: "[]",
      source: "npm",
      trustedSourceId: "",
      trustedSourcePolicy: ".github/package-trusted-sources.json",
    });
  });

  it("rejects option-shaped package candidate option values", () => {
    for (const flag of [
      "--artifact-dir",
      "--github-output",
      "--metadata",
      "--output-dir",
      "--output-name",
      "--package-ref",
      "--package-spec",
      "--package-url",
      "--package-sha256",
      "--source",
      "--trusted-source-id",
      "--trusted-source-policy",
    ]) {
      expect(() => parseArgs([flag, "--output-dir", "out"]), flag).toThrow(
        `${flag} requires a value`,
      );
      expect(() => parseArgs([flag, "-h"]), flag).toThrow(`${flag} requires a value`);
    }
  });

  it("rejects duplicate package candidate CLI options", () => {
    const requiredArgs = ["--source", "npm", "--output-dir", ".artifacts/docker-e2e-package"];
    const duplicateCases = [
      ["--artifact-dir", [...requiredArgs, "--artifact-dir", "one", "--artifact-dir", "two"]],
      [
        "--github-output",
        [...requiredArgs, "--github-output", "one.out", "--github-output", "two.out"],
      ],
      ["--metadata", [...requiredArgs, "--metadata", "one.json", "--metadata", "two.json"]],
      ["--output-dir", ["--source", "npm", "--output-dir", "one", "--output-dir", "two"]],
      ["--output-name", [...requiredArgs, "--output-name", "one.tgz", "--output-name", "two.tgz"]],
      ["--package-ref", [...requiredArgs, "--package-ref", "one", "--package-ref", "two"]],
      [
        "--package-spec",
        [...requiredArgs, "--package-spec", "mangabaclaw@beta", "--package-spec", "mangabaclaw@latest"],
      ],
      [
        "--package-url",
        [...requiredArgs, "--package-url", "", "--package-url", "https://example.com/mangabaclaw.tgz"],
      ],
      ["--package-sha256", [...requiredArgs, "--package-sha256", "", "--package-sha256", "abc123"]],
      [
        "--source",
        [
          "--source",
          "npm",
          "--source",
          "artifact",
          "--output-dir",
          ".artifacts/docker-e2e-package",
        ],
      ],
      [
        "--trusted-source-id",
        [...requiredArgs, "--trusted-source-id", "one", "--trusted-source-id", "two"],
      ],
      [
        "--trusted-source-policy",
        [
          ...requiredArgs,
          "--trusted-source-policy",
          "one.json",
          "--trusted-source-policy",
          "two.json",
        ],
      ],
    ] satisfies Array<[string, string[]]>;

    for (const [flag, args] of duplicateCases) {
      expect(() => parseArgs(args), flag).toThrow(`${flag} was provided more than once`);
    }
  });

  it("rejects package candidate output names that escape the output directory", () => {
    for (const outputName of [
      "../mangabaclaw-current.tgz",
      "nested/mangabaclaw-current.tgz",
      "mangabaclaw-current.zip",
      ".mangabaclaw-current.tgz",
    ]) {
      expect(() => parseArgs(["--output-name", outputName])).toThrow(
        `--output-name must be a tarball filename, not a path: ${outputName}`,
      );
    }

    expect(parseArgs(["--output-name", "mangabaclaw-current.tar.gz"]).outputName).toBe(
      "mangabaclaw-current.tar.gz",
    );
  });

  it("resolves npm package candidates through the Windows npm.cmd toolchain shim", () => {
    const execPath = "C:\\nodejs\\node.exe";
    const npmCmdPath = path.win32.resolve(path.win32.dirname(execPath), "npm.cmd");

    const runner = resolveNpmPackageCandidatePackRunner(
      "mangabaclaw@2026.5.26-beta.1",
      "C:\\mangabaclaw\\.artifacts\\docker-e2e-package",
      {
        comSpec: "C:\\Windows\\System32\\cmd.exe",
        env: {},
        execPath,
        existsSync: (candidate) => candidate === npmCmdPath,
        platform: "win32",
      },
    );

    expect(runner).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        `${npmCmdPath} pack mangabaclaw@2026.5.26-beta.1 --ignore-scripts --json --pack-destination C:\\mangabaclaw\\.artifacts\\docker-e2e-package`,
      ],
      shell: false,
      windowsVerbatimArguments: true,
    });
  });

  it("keeps npm pack filenames inside the package candidate output directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-npm-pack-"));
    tempDirs.push(dir);
    await writeFile(path.join(dir, "mangabaclaw-2026.6.17.tgz"), "package");

    await expect(
      moveNewestPackedTarballForTest(
        dir,
        JSON.stringify([{ filename: "mangabaclaw-2026.6.17.tgz" }]),
        "mangabaclaw-current.tgz",
      ),
    ).resolves.toBe(path.join(dir, "mangabaclaw-current.tgz"));
    await expect(readFile(path.join(dir, "mangabaclaw-current.tgz"), "utf8")).resolves.toBe("package");
  });

  it("reads npm 12 name-keyed package candidate filenames", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-npm-pack-"));
    tempDirs.push(dir);
    await writeFile(path.join(dir, "mangabaclaw-2026.6.17.tgz"), "package");

    await expect(
      moveNewestPackedTarballForTest(
        dir,
        JSON.stringify({ mangabaclaw: { filename: "mangabaclaw-2026.6.17.tgz" } }),
        "mangabaclaw-current.tgz",
      ),
    ).resolves.toBe(path.join(dir, "mangabaclaw-current.tgz"));
  });

  it("rejects path-like npm pack filenames instead of renaming outside the output directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-npm-pack-"));
    tempDirs.push(dir);

    const unsafeFilenames = [
      "../mangabaclaw-2026.6.17.tgz",
      "nested/mangabaclaw-2026.6.17.tgz",
      "nested\\mangabaclaw-2026.6.17.tgz",
      "/tmp/mangabaclaw-2026.6.17.tgz",
      "C:\\temp\\mangabaclaw-2026.6.17.tgz",
      "mangabaclaw-2026.6.17.tar.gz",
    ];

    for (const filename of unsafeFilenames) {
      await expect(
        moveNewestPackedTarballForTest(dir, JSON.stringify([{ filename }]), "mangabaclaw-current.tgz"),
      ).rejects.toThrow("npm pack reported unsafe MangabaClaw tarball filename");
    }
  });

  it("rejects unsafe text npm pack filenames instead of using loose stdout fallback", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-npm-pack-"));
    tempDirs.push(dir);
    await writeFile(path.join(dir, "mangabaclaw-2026.6.17.tgz"), "safe fallback");

    for (const filename of ["../mangabaclaw-2026.6.17.tgz", "C:mangabaclaw-2026.6.17.tgz"]) {
      await expect(
        moveNewestPackedTarballForTest(
          dir,
          ["npm notice", filename].join("\n"),
          "mangabaclaw-current.tgz",
        ),
      ).rejects.toThrow("npm pack reported unsafe MangabaClaw tarball filename");
    }
  });

  it("cleans stale package tarballs before npm fallback scanning", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-npm-pack-stale-"));
    tempDirs.push(dir);
    await writeFile(path.join(dir, "mangabaclaw-9999.1.1.tgz"), "stale");
    await writeFile(path.join(dir, "mangabaclaw-C:evil.tgz"), "unsafe");

    await cleanPackedMangabaClawTarballsForTest(dir);
    await writeFile(path.join(dir, "mangabaclaw-2026.6.17.tgz"), "current");

    await expect(
      moveNewestPackedTarballForTest(dir, "npm notice\n", "mangabaclaw-current.tgz"),
    ).resolves.toBe(path.join(dir, "mangabaclaw-current.tgz"));
    await expect(missing(path.join(dir, "mangabaclaw-9999.1.1.tgz"))).resolves.toBe(true);
    await expect(readFile(path.join(dir, "mangabaclaw-C:evil.tgz"), "utf8")).resolves.toBe("unsafe");
    await expect(readFile(path.join(dir, "mangabaclaw-current.tgz"), "utf8")).resolves.toBe("current");
  });

  it("bounds captured command stderr tails on failures", async () => {
    await expect(
      runCommandForTest(
        process.execPath,
        [
          "-e",
          [
            "const fs = require('node:fs');",
            "fs.writeSync(2, 'old ' + 'x'.repeat(9 * 1024 * 1024));",
            "fs.writeSync(2, 'recent failure');",
            "process.exit(7);",
          ].join(""),
        ],
        { capture: true },
      ),
    ).rejects.toThrow(
      /failed with 7\n\[output truncated \d+ chars; showing tail\][\s\S]*recent failure/u,
    );
  });

  it("rejects truncated captured stdout instead of parsing partial command output", async () => {
    await expect(
      runCommandForTest(
        process.execPath,
        ["-e", "require('node:fs').writeSync(1, 'x'.repeat(9 * 1024 * 1024));"],
        { capture: true },
      ),
    ).rejects.toThrow(/produced more than \d+ captured stdout chars/u);
  });

  it("clamps oversized package runner command timers before scheduling", async () => {
    await expect(
      runCommandForTest(process.execPath, ["-e", "setTimeout(() => process.exit(0), 25);"], {
        killAfterMs: Number.MAX_SAFE_INTEGER,
        timeoutMs: Number.MAX_SAFE_INTEGER,
      }),
    ).resolves.toBe("");
  });

  it("kills timed-out package runner process groups", async () => {
    if (process.platform === "win32") {
      return;
    }

    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-runner-timeout-"));
    tempDirs.push(dir);
    const childPidPath = path.join(dir, "child.pid");
    let childPid: number | undefined;

    try {
      const childScript = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);";
      const parentScript = [
        "const { spawn } = require('node:child_process');",
        "const fs = require('node:fs');",
        `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], { stdio: 'ignore' });`,
        "fs.writeFileSync(process.env.MANGABACLAW_TEST_CHILD_PID, String(child.pid));",
        "setInterval(() => {}, 1000);",
      ].join("");

      const timeoutAssertion = expect(
        runCommandForTest(process.execPath, ["-e", parentScript], {
          env: { ...process.env, MANGABACLAW_TEST_CHILD_PID: childPidPath },
          killAfterMs: 25,
          timeoutMs: 500,
        }),
      ).rejects.toThrow(/timed out after 500ms/u);

      await waitForFile(childPidPath, 2_000);
      childPid = Number.parseInt(readFileSync(childPidPath, "utf8"), 10);
      await timeoutAssertion;
      await waitForDead(childPid, 2_000);
    } finally {
      if (childPid !== undefined && isProcessAlive(childPid)) {
        process.kill(childPid, "SIGKILL");
      }
    }
  });

  it("clamps oversized package runner kill grace before scheduling", async () => {
    if (process.platform === "win32") {
      return;
    }

    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-runner-grace-"));
    tempDirs.push(dir);
    const childPidPath = path.join(dir, "child.pid");
    const cleanupPath = path.join(dir, "child.cleanup");
    let childPid: number | undefined;

    try {
      const childScript = [
        "const fs = require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(childPidPath)}, String(process.pid));`,
        "process.on('SIGTERM', () => {",
        `  setTimeout(() => { fs.writeFileSync(${JSON.stringify(cleanupPath)}, 'clean'); process.exit(0); }, 75);`,
        "});",
        "setInterval(() => {}, 1000);",
      ].join("\n");

      const timeoutAssertion = expect(
        runCommandForTest(process.execPath, ["-e", childScript], {
          killAfterMs: Number.MAX_SAFE_INTEGER,
          timeoutMs: 500,
        }),
      ).rejects.toThrow(/timed out after 500ms/u);

      await waitForFile(childPidPath, 2_000);
      childPid = Number.parseInt(readFileSync(childPidPath, "utf8"), 10);
      await timeoutAssertion;
      expect(readFileSync(cleanupPath, "utf8")).toBe("clean");
    } finally {
      if (childPid !== undefined && isProcessAlive(childPid)) {
        process.kill(childPid, "SIGKILL");
      }
    }
  });

  it("rejects timed-out package runner commands when descendants exit cleanly", async () => {
    if (process.platform === "win32") {
      return;
    }

    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-runner-timeout-clean-"));
    tempDirs.push(dir);
    const childPidPath = path.join(dir, "child.pid");
    const readyPath = path.join(dir, "child.ready");
    const cleanupPath = path.join(dir, "child.cleanup");

    const childScript = [
      "const fs = require('node:fs');",
      "process.on('SIGTERM', () => {",
      "  fs.writeFileSync(process.env.MANGABACLAW_TEST_CHILD_CLEANUP, 'clean');",
      "  setTimeout(() => process.exit(0), 25);",
      "});",
      "fs.writeFileSync(process.env.MANGABACLAW_TEST_CHILD_READY, 'ready');",
      "setInterval(() => {}, 1000);",
    ].join("");
    const parentScript = [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], {`,
      "  stdio: 'ignore',",
      "  env: {",
      "    ...process.env,",
      "    MANGABACLAW_TEST_CHILD_CLEANUP: process.env.MANGABACLAW_TEST_CHILD_CLEANUP,",
      "    MANGABACLAW_TEST_CHILD_READY: process.env.MANGABACLAW_TEST_CHILD_READY,",
      "  },",
      "});",
      "fs.writeFileSync(process.env.MANGABACLAW_TEST_CHILD_PID, String(child.pid));",
      "process.on('SIGTERM', () => process.exit(0));",
      "setInterval(() => {}, 1000);",
    ].join("");

    const timeoutAssertion = expect(
      runCommandForTest(process.execPath, ["-e", parentScript], {
        env: {
          ...process.env,
          MANGABACLAW_TEST_CHILD_CLEANUP: cleanupPath,
          MANGABACLAW_TEST_CHILD_PID: childPidPath,
          MANGABACLAW_TEST_CHILD_READY: readyPath,
        },
        killAfterMs: 250,
        timeoutMs: 250,
      }),
    ).rejects.toThrow(/timed out after 250ms/u);

    await waitForFile(readyPath, 2_000);
    await timeoutAssertion;

    expect(readFileSync(cleanupPath, "utf8")).toBe("clean");
  });

  it("forwards external termination to package runner process groups", async () => {
    if (process.platform === "win32") {
      return;
    }

    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-runner-signal-"));
    tempDirs.push(dir);
    const childPidPath = path.join(dir, "child.pid");
    const scriptUrl = pathToFileURL(
      path.resolve("scripts/resolve-mangabaclaw-package-candidate.mts"),
    ).href;
    let childPid: number | undefined;
    let runnerPid: number | undefined;

    try {
      const childScript = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);";
      const parentScript = [
        "const { spawn } = require('node:child_process');",
        "const fs = require('node:fs');",
        `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], { stdio: 'ignore' });`,
        "fs.writeFileSync(process.env.MANGABACLAW_TEST_CHILD_PID, String(child.pid));",
        "setInterval(() => {}, 1000);",
      ].join("");
      // Accelerate only the module-level 5s forwarded-signal failsafe in this disposable runner.
      const runnerScript = [
        "const realSetTimeout = globalThis.setTimeout;",
        "globalThis.setTimeout = (callback, delay, ...args) =>",
        "  realSetTimeout(callback, delay === 5000 ? 25 : delay, ...args);",
        `const { runCommandForTest } = await import(${JSON.stringify(scriptUrl)});`,
        `await runCommandForTest(process.execPath, ['-e', ${JSON.stringify(parentScript)}], { timeoutMs: 60000 });`,
      ].join("\n");
      const runner = spawn(process.execPath, ["--input-type=module", "-e", runnerScript], {
        cwd: process.cwd(),
        env: { ...process.env, MANGABACLAW_TEST_CHILD_PID: childPidPath },
        stdio: ["ignore", "ignore", "pipe"],
      });
      runnerPid = runner.pid;

      await waitForFile(childPidPath, 2_000);
      childPid = Number.parseInt(readFileSync(childPidPath, "utf8"), 10);
      runner.kill("SIGTERM");
      const result = await waitForExit(runner, 7_000);

      expect(result).toEqual({ signal: null, status: 143 });
      await waitForDead(childPid, 2_000);
    } finally {
      if (runnerPid !== undefined && isProcessAlive(runnerPid)) {
        process.kill(runnerPid, "SIGKILL");
      }
      if (childPid !== undefined && isProcessAlive(childPid)) {
        process.kill(childPid, "SIGKILL");
      }
    }
  });

  it("fails successful ref candidates when package source worktree cleanup fails", async () => {
    await expect(
      cleanupPackageSourceWorktreeForTest("/tmp/mangabaclaw-package-source-stuck", {
        runImpl: async () => {
          throw new Error("worktree remove denied");
        },
      }),
    ).rejects.toThrow("worktree remove denied");
  });

  it("preserves original ref candidate failures when worktree cleanup also fails", async () => {
    const warnings: string[] = [];

    await expect(
      cleanupPackageSourceWorktreeForTest("/tmp/mangabaclaw-package-source-stuck", {
        consoleError: (message: string) => warnings.push(message),
        resolveError: new Error("package build failed"),
        runImpl: async () => {
          throw new Error("worktree remove denied");
        },
      }),
    ).resolves.toBeUndefined();
    expect(warnings).toEqual([
      "warning: failed to remove temporary package source worktree /tmp/mangabaclaw-package-source-stuck: worktree remove denied",
    ]);
  });

  it("loads named trusted package URL source policies", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-trusted-package-source-"));
    tempDirs.push(dir);
    const policy = path.join(dir, "trusted-sources.json");
    await writeFile(
      policy,
      JSON.stringify({
        schemaVersion: 1,
        sources: {
          "enterprise-artifactory": {
            allowPrivateNetwork: true,
            hosts: ["packages.internal"],
            pathPrefixes: ["/artifactory/mangabaclaw/"],
            ports: [443, 8443],
            redirectHosts: ["packages.internal", "mirror.internal"],
          },
        },
      }),
    );

    await expect(loadTrustedPackageSource("enterprise-artifactory", policy)).resolves.toEqual({
      allowPrivateNetwork: true,
      auth: undefined,
      hosts: ["packages.internal"],
      id: "enterprise-artifactory",
      pathPrefixes: ["/artifactory/mangabaclaw/"],
      ports: [443, 8443],
      redirectHosts: ["packages.internal", "mirror.internal"],
    });
    await expect(loadTrustedPackageSource("missing", policy)).rejects.toThrow(
      "Unknown trusted package source: missing",
    );
  });

  it("rejects loose trusted package source port values", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-trusted-package-source-"));
    tempDirs.push(dir);
    const policy = path.join(dir, "trusted-sources.json");
    await writeFile(
      policy,
      JSON.stringify({
        schemaVersion: 1,
        sources: {
          exponent: {
            hosts: ["packages.example"],
            pathPrefixes: ["/mangabaclaw/"],
            ports: ["1e3"],
          },
          fractional: {
            hosts: ["packages.example"],
            pathPrefixes: ["/mangabaclaw/"],
            ports: [443.5],
          },
          hex: {
            hosts: ["packages.example"],
            pathPrefixes: ["/mangabaclaw/"],
            ports: ["0x1bb"],
          },
        },
      }),
    );

    await expect(loadTrustedPackageSource("exponent", policy)).rejects.toThrow(
      "trusted package source exponent has invalid ports",
    );
    await expect(loadTrustedPackageSource("fractional", policy)).rejects.toThrow(
      "trusted package source fractional has invalid ports",
    );
    await expect(loadTrustedPackageSource("hex", policy)).rejects.toThrow(
      "trusted package source hex has invalid ports",
    );
  });

  it("rejects unsafe package_url downloads before fetching private targets", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");

    await expect(
      downloadUrl("http://packages.example/mangabaclaw.tgz", target, {
        fetchImpl: unexpectedFetch,
        lookupHost: lookupAddresses([{ address: "93.184.216.34", family: 4 }]),
      }),
    ).rejects.toThrow("package_url must use https");
    await expect(
      downloadUrl("https://user@packages.example/mangabaclaw.tgz", target, {
        fetchImpl: unexpectedFetch,
        lookupHost: lookupAddresses([{ address: "93.184.216.34", family: 4 }]),
      }),
    ).rejects.toThrow("package_url must not include credentials");
    await expect(
      downloadUrl("https://localhost/mangabaclaw.tgz", target, {
        fetchImpl: unexpectedFetch,
        lookupHost: lookupAddresses([{ address: "127.0.0.1", family: 4 }]),
      }),
    ).rejects.toThrow(/private\/internal\/special-use/iu);
    await expect(
      downloadUrl("https://packages.example/mangabaclaw.tgz", target, {
        fetchImpl: unexpectedFetch,
        lookupHost: lookupAddresses([{ address: "10.0.0.8", family: 4 }]),
      }),
    ).rejects.toThrow(/resolves to private\/internal\/special-use/iu);
    await expect(
      downloadUrl("https://packages.example/mangabaclaw.tgz", target, {
        fetchImpl: unexpectedFetch,
        lookupHost: lookupAddresses([{ address: "64:ff9b::a9fe:a9fe", family: 6 }]),
      }),
    ).rejects.toThrow(/resolves to private\/internal\/special-use/iu);
  });

  it("allows private package_url downloads only through an explicit trusted source policy", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");
    const trustedSource = {
      allowPrivateNetwork: true,
      hosts: ["packages.internal"],
      id: "enterprise-artifactory",
      pathPrefixes: ["/artifactory/mangabaclaw/"],
      ports: [8443],
      redirectHosts: ["packages.internal"],
    };
    const requestedUrls: string[] = [];

    await downloadUrl("https://packages.internal:8443/artifactory/mangabaclaw/mangabaclaw.tgz", target, {
      fetchImpl: async (url: URL) => {
        requestedUrls.push(url.toString());
        return new Response(new Uint8Array([4, 5, 6]), {
          headers: { "content-length": "3" },
          status: 200,
        });
      },
      lookupHost: lookupAddresses([{ address: "203.0.113.8", family: 4 }]),
      maxBytes: 3,
      trustedSource,
    });

    expect(requestedUrls).toEqual([
      "https://packages.internal:8443/artifactory/mangabaclaw/mangabaclaw.tgz",
    ]);
    await expect(readFile(target)).resolves.toEqual(Buffer.from([4, 5, 6]));

    await expect(
      downloadUrl("https://evil.internal:8443/artifactory/mangabaclaw/mangabaclaw.tgz", target, {
        fetchImpl: unexpectedFetch,
        lookupHost: lookupAddresses([{ address: "10.0.0.9", family: 4 }]),
        trustedSource,
      }),
    ).rejects.toThrow("is not allowed by trusted package source enterprise-artifactory");
    await expect(
      downloadUrl("https://packages.internal:8443/other/mangabaclaw.tgz", target, {
        fetchImpl: unexpectedFetch,
        lookupHost: lookupAddresses([{ address: "203.0.113.8", family: 4 }]),
        trustedSource,
      }),
    ).rejects.toThrow("path is not allowed by trusted package source enterprise-artifactory");
  });

  it("matches trusted package_url path prefixes on path segment boundaries", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");
    const trustedSource = {
      allowPrivateNetwork: true,
      hosts: ["packages.internal"],
      id: "enterprise-artifactory",
      pathPrefixes: ["/artifactory/mangabaclaw"],
      ports: [8443],
      redirectHosts: ["packages.internal"],
    };
    const requestedUrls: string[] = [];

    await downloadUrl("https://packages.internal:8443/artifactory/mangabaclaw/pkg.tgz", target, {
      fetchImpl: async (url: URL) => {
        requestedUrls.push(url.toString());
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-length": "3" },
          status: 200,
        });
      },
      lookupHost: lookupAddresses([{ address: "203.0.113.8", family: 4 }]),
      maxBytes: 3,
      trustedSource,
    });

    expect(requestedUrls).toEqual(["https://packages.internal:8443/artifactory/mangabaclaw/pkg.tgz"]);
    await expect(
      downloadUrl("https://packages.internal:8443/artifactory/mangabaclaw-malicious/pkg.tgz", target, {
        fetchImpl: unexpectedFetch,
        lookupHost: lookupAddresses([{ address: "203.0.113.8", family: 4 }]),
        trustedSource,
      }),
    ).rejects.toThrow("path is not allowed by trusted package source enterprise-artifactory");
  });

  it("keeps trusted package_url redirects inside the named source policy", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");
    const trustedSource = {
      allowPrivateNetwork: true,
      hosts: ["packages.internal"],
      id: "enterprise-artifactory",
      pathPrefixes: ["/artifactory/mangabaclaw/"],
      ports: [8443],
      redirectHosts: ["packages.internal"],
    };

    await expect(
      downloadUrl("https://packages.internal:8443/artifactory/mangabaclaw/mangabaclaw.tgz", target, {
        fetchImpl: async () =>
          new Response(null, {
            headers: { location: "https://metadata.internal:8443/artifactory/mangabaclaw/pwn.tgz" },
            status: 302,
          }),
        lookupHost: lookupAddresses([{ address: "10.0.0.8", family: 4 }]),
        trustedSource,
      }),
    ).rejects.toThrow("is not allowed by trusted package source enterprise-artifactory");
  });

  it("does not forward trusted package auth headers to redirect hosts", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");
    const previousToken = process.env.MANGABACLAW_TRUSTED_PACKAGE_TOKEN;
    process.env.MANGABACLAW_TRUSTED_PACKAGE_TOKEN = "token-123";
    const trustedSource = {
      allowPrivateNetwork: true,
      auth: { type: "bearer" },
      hosts: ["packages.internal"],
      id: "enterprise-artifactory",
      pathPrefixes: ["/artifactory/mangabaclaw/"],
      ports: [8443],
      redirectHosts: ["packages.internal", "mirror.internal"],
    };
    const requestHeaders: Array<Record<string, string> | undefined> = [];

    try {
      await downloadUrl(
        "https://packages.internal:8443/artifactory/mangabaclaw/mangabaclaw.tgz",
        target,
        {
          fetchImpl: async (_url: URL, init?: RequestInit) => {
            requestHeaders.push(init?.headers as Record<string, string> | undefined);
            if (requestHeaders.length === 1) {
              return new Response(null, {
                headers: {
                  location: "https://mirror.internal:8443/artifactory/mangabaclaw/mangabaclaw.tgz",
                },
                status: 302,
              });
            }
            return new Response(new Uint8Array([4, 5, 6]), {
              headers: { "content-length": "3" },
              status: 200,
            });
          },
          lookupHost: lookupAddresses([{ address: "10.0.0.8", family: 4 }]),
          maxBytes: 3,
          trustedSource,
        },
      );
    } finally {
      if (previousToken === undefined) {
        delete process.env.MANGABACLAW_TRUSTED_PACKAGE_TOKEN;
      } else {
        process.env.MANGABACLAW_TRUSTED_PACKAGE_TOKEN = previousToken;
      }
    }

    expect(requestHeaders).toEqual([{ authorization: "Bearer token-123" }, undefined]);
    await expect(readFile(target)).resolves.toEqual(Buffer.from([4, 5, 6]));
  });

  it("validates redirects for package_url downloads", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");
    const requestedUrls: string[] = [];

    await expect(
      downloadUrl("https://packages.example/mangabaclaw.tgz", target, {
        fetchImpl: async (url: URL) => {
          requestedUrls.push(url.toString());
          return new Response(null, {
            headers: { location: "https://169.254.169.254/latest/meta-data" },
            status: 302,
          });
        },
        lookupHost: lookupAddresses([{ address: "93.184.216.34", family: 4 }]),
      }),
    ).rejects.toThrow(/private\/internal\/special-use/iu);
    expect(requestedUrls).toEqual(["https://packages.example/mangabaclaw.tgz"]);
  });

  it("cancels redirect response bodies before following the next hop", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");
    const bodyCancelled: string[] = [];

    await expect(
      downloadUrl("https://packages.example/mangabaclaw.tgz", target, {
        fetchImpl: async (url: URL) => {
          let cancelled = false;
          const body = new ReadableStream({
            start(controller) {
              const timer = setInterval(() => {
                if (cancelled) {
                  clearInterval(timer);
                  return;
                }
                try {
                  controller.enqueue(new Uint8Array([0]));
                } catch {
                  // Controller may already be closed after cancel.
                  clearInterval(timer);
                }
              }, 100);
            },
            cancel() {
              cancelled = true;
              bodyCancelled.push(url.toString());
            },
          });
          return new Response(body, {
            headers: { location: "https://packages.example/redirected.tgz" },
            status: 302,
          });
        },
        lookupHost: lookupAddresses([{ address: "93.184.216.34", family: 4 }]),
        timeoutMs: 5000,
      }),
    ).rejects.toThrow();
    // The redirect body must have been cancelled, not left open
    expect(bodyCancelled.length).toBeGreaterThan(0);
  });

  it("cancels response body on HTTP error before closing dispatcher", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");
    let bodyCancelled = false;

    await expect(
      downloadUrl("https://packages.example/mangabaclaw.tgz", target, {
        fetchImpl: async () => {
          const body = new ReadableStream({
            start(controller) {
              const timer = setInterval(() => {
                try {
                  controller.enqueue(new Uint8Array([0]));
                } catch {
                  clearInterval(timer);
                }
              }, 100);
            },
            cancel() {
              bodyCancelled = true;
            },
          });
          return new Response(body, { status: 500 });
        },
        lookupHost: lookupAddresses([{ address: "93.184.216.34", family: 4 }]),
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/failed to download package_url: HTTP 500/u);
    expect(bodyCancelled).toBe(true);
  });

  it("cancels response body on declared oversize before closing dispatcher", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");
    let bodyCancelled = false;

    await expect(
      downloadUrl("https://packages.example/mangabaclaw.tgz", target, {
        fetchImpl: async () => {
          const body = new ReadableStream({
            start(controller) {
              const timer = setInterval(() => {
                try {
                  controller.enqueue(new Uint8Array([0]));
                } catch {
                  clearInterval(timer);
                }
              }, 100);
            },
            cancel() {
              bodyCancelled = true;
            },
          });
          return new Response(body, {
            headers: { "content-length": String(1024 * 1024 * 100) },
            status: 200,
          });
        },
        lookupHost: lookupAddresses([{ address: "93.184.216.34", family: 4 }]),
        maxBytes: 1024,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/exceeds maximum download size/u);
    expect(bodyCancelled).toBe(true);
  });

  it("rejects unsafe decimal package_url content-length values before reading", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");
    let readStarted = false;
    let bodyCancelled = false;

    await expect(
      downloadUrl("https://packages.example/mangabaclaw.tgz", target, {
        fetchImpl: async () =>
          ({
            body: {
              cancel() {
                bodyCancelled = true;
                return Promise.resolve();
              },
              getReader() {
                return {
                  cancel() {
                    bodyCancelled = true;
                    return Promise.resolve();
                  },
                  read() {
                    readStarted = true;
                    return new Promise(() => {});
                  },
                  releaseLock() {},
                };
              },
            },
            headers: new Headers({ "content-length": "9007199254740993" }),
            status: 200,
          }) as Response,
        lookupHost: lookupAddresses([{ address: "93.184.216.34", family: 4 }]),
        maxBytes: 1024,
        timeoutMs: 25,
      }),
    ).rejects.toThrow(/exceeds maximum download size/u);
    expect(readStarted).toBe(false);
    expect(bodyCancelled).toBe(true);
    await expect(missing(target)).resolves.toBe(true);
    await expect(missing(`${target}.tmp`)).resolves.toBe(true);
  });

  it("bounds package_url downloads and writes completed files atomically", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");

    await expect(
      downloadUrl("https://packages.example/mangabaclaw.tgz", target, {
        fetchImpl: async () =>
          new Response(new Uint8Array([1, 2, 3, 4]), {
            headers: { "content-length": "4" },
            status: 200,
          }),
        lookupHost: lookupAddresses([{ address: "93.184.216.34", family: 4 }]),
        maxBytes: 3,
      }),
    ).rejects.toThrow("package_url exceeds maximum download size");
    await expect(missing(target)).resolves.toBe(true);
    await expect(missing(`${target}.tmp`)).resolves.toBe(true);

    await downloadUrl("https://packages.example/mangabaclaw.tgz", target, {
      fetchImpl: async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-length": "3" },
          status: 200,
        }),
      lookupHost: lookupAddresses([{ address: "93.184.216.34", family: 4 }]),
      maxBytes: 3,
    });
    await expect(readFile(target)).resolves.toEqual(Buffer.from([1, 2, 3]));
    await expect(missing(`${target}.tmp`)).resolves.toBe(true);
  });

  it("clamps oversized package_url download timers before scheduling", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");

    await downloadUrl("https://packages.example/mangabaclaw.tgz", target, {
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              setTimeout(() => {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                controller.close();
              }, 25);
            },
          }),
          {
            headers: { "content-length": "3" },
            status: 200,
          },
        ),
      lookupHost: lookupAddresses([{ address: "93.184.216.34", family: 4 }]),
      maxBytes: 3,
      timeoutMs: Number.MAX_SAFE_INTEGER,
    });

    await expect(readFile(target)).resolves.toEqual(Buffer.from([1, 2, 3]));
    await expect(missing(`${target}.tmp`)).resolves.toBe(true);
  });

  it("times out stalled package_url response bodies", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-timeout-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");
    let bodyCancelled = false;
    const startedAt = Date.now();

    await expect(
      downloadUrl("https://packages.example/mangabaclaw.tgz", target, {
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              pull() {
                return new Promise(() => {});
              },
              cancel() {
                bodyCancelled = true;
              },
            }),
            { status: 200 },
          ),
        lookupHost: lookupAddresses([{ address: "93.184.216.34", family: 4 }]),
        timeoutMs: 25,
      }),
    ).rejects.toThrow(
      "package_url download timed out after 25ms: https://packages.example/mangabaclaw.tgz",
    );

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(bodyCancelled).toBe(true);
    await expect(missing(target)).resolves.toBe(true);
    await expect(missing(`${target}.tmp`)).resolves.toBe(true);
  });

  it("streams non-decimal package_url content-length values through the download cap", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-download-"));
    tempDirs.push(dir);
    const target = path.join(dir, "mangabaclaw.tgz");
    let readStarted = false;
    let bodyCancelled = false;

    await expect(
      downloadUrl("https://packages.example/mangabaclaw.tgz", target, {
        fetchImpl: async () => {
          const body = new ReadableStream({
            pull(controller) {
              readStarted = true;
              controller.enqueue(new Uint8Array([1, 2, 3, 4]));
            },
            cancel() {
              bodyCancelled = true;
            },
          });
          return new Response(body, {
            headers: { "content-length": "1e3" },
            status: 200,
          });
        },
        lookupHost: lookupAddresses([{ address: "93.184.216.34", family: 4 }]),
        maxBytes: 3,
      }),
    ).rejects.toThrow("package_url exceeds maximum download size");
    expect(readStarted).toBe(true);
    expect(bodyCancelled).toBe(true);
    await expect(missing(target)).resolves.toBe(true);
    await expect(missing(`${target}.tmp`)).resolves.toBe(true);
  });

  it("reads package source metadata from package artifacts", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-candidate-"));
    tempDirs.push(dir);
    await writeFile(
      path.join(dir, "package-candidate.json"),
      JSON.stringify(
        {
          packageRef: "release/2026.4.30",
          packageSourceSha: "66ce632b9b7c5c7fdd3e66c739687d51638ad6e2",
          packageTrustedReason: "repository-branch-history",
          sha256: "a".repeat(64),
        },
        null,
        2,
      ),
    );

    await expect(readArtifactPackageCandidateMetadata(dir)).resolves.toEqual({
      packageRef: "release/2026.4.30",
      packageSourceSha: "66ce632b9b7c5c7fdd3e66c739687d51638ad6e2",
      packageTrustedReason: "repository-branch-history",
      sha256: "a".repeat(64),
    });
  });

  it("normalizes artifact package source SHAs before workflow output", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-candidate-sha-"));
    tempDirs.push(dir);
    await writeFile(
      path.join(dir, "package-candidate.json"),
      JSON.stringify({
        packageSourceSha: "66CE632B9B7C5C7FDD3E66C739687D51638AD6E2",
      }),
    );

    await expect(readArtifactPackageCandidateMetadata(dir)).resolves.toEqual({
      packageSourceSha: "66ce632b9b7c5c7fdd3e66c739687d51638ad6e2",
    });
  });

  it("normalizes whitespace-only artifact package source SHAs to absent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-candidate-empty-sha-"));
    tempDirs.push(dir);
    await writeFile(
      path.join(dir, "package-candidate.json"),
      JSON.stringify({
        packageSourceSha: " \r\n ",
      }),
    );

    await expect(readArtifactPackageCandidateMetadata(dir)).resolves.toEqual({
      packageSourceSha: "",
    });
  });

  it("rejects malformed artifact package source SHAs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-candidate-bad-sha-"));
    tempDirs.push(dir);
    await writeFile(
      path.join(dir, "package-candidate.json"),
      JSON.stringify({
        packageSourceSha: "66ce632b9b7c5c7fdd3e66c739687d51638ad6e2\r\nsource=main",
      }),
    );

    await expect(readArtifactPackageCandidateMetadata(dir)).rejects.toThrow(
      "artifact package-candidate.json packageSourceSha must be a 40-character commit SHA",
    );
  });

  it("accepts uppercase package artifact SHA-256 metadata", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-sha-"));
    tempDirs.push(dir);
    const file = path.join(dir, "mangabaclaw.tgz");
    await writeFile(file, "mangabaclaw package bytes");
    const digest = "ae0b98d18c80dbf9447fa48560a139195595db2d337ad33421ca2183b0dd3e99";

    await expect(assertExpectedSha256ForTest(file, digest.toUpperCase())).resolves.toBe(digest);
  });

  it("rejects source artifact scans that exceed the filesystem entry limit", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-artifact-scan-"));
    tempDirs.push(dir);
    const maxEntries = 3;

    for (let index = 0; index <= maxEntries; index += 1) {
      await writeFile(path.join(dir, `not-a-package-${index}.txt`), "x");
    }

    await expect(findSingleTarballForTest(dir, maxEntries)).rejects.toThrow(
      `source=artifact scan exceeded ${maxEntries} filesystem entries`,
    );
  });

  it("rejects source artifact directories with multiple tarballs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-artifact-duplicates-"));
    tempDirs.push(dir);

    await writeFile(path.join(dir, "mangabaclaw-a.tgz"), "a");
    await writeFile(path.join(dir, "nested.tar.gz"), "b");

    const error = await findSingleTarballForTest(dir).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("source=artifact requires exactly one .tgz");
    expect(message).toContain("nested.tar.gz");
    expect(message).toContain("mangabaclaw-a.tgz");
    expect(message).not.toContain(path.join(dir, "nested.tar.gz"));
    expect(message).not.toContain(path.join(dir, "mangabaclaw-a.tgz"));
  });

  it("reads the source SHA from packed npm build metadata", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mangabaclaw-package-build-info-"));
    tempDirs.push(dir);
    const root = path.join(dir, "package");
    await mkdir(path.join(root, "dist"), { recursive: true });
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "mangabaclaw" }));
    await writeFile(
      path.join(root, "dist", "build-info.json"),
      JSON.stringify({ commit: "66CE632B9B7C5C7FDD3E66C739687D51638AD6E2" }),
    );
    const tarball = path.join(dir, "mangabaclaw.tgz");
    await new Promise<void>((resolve, reject) => {
      execFile("tar", ["-czf", tarball, "-C", dir, "package"], (error) => {
        if (error) {
          reject(toLintErrorObject(error, "Non-Error rejection"));
          return;
        }
        resolve();
      });
    });

    await expect(readPackageBuildSourceSha(tarball)).resolves.toBe(
      "66ce632b9b7c5c7fdd3e66c739687d51638ad6e2",
    );
  });
});
