// CLI JSON stdout E2E tests validate machine-readable CLI output.
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { withTempHome } from "mangabaclaw/plugin-sdk/test-env";
import { describe, expect, it } from "vitest";

function runBuiltCli(tempHome: string, args: string[], envOverrides: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: tempHome,
    USERPROFILE: tempHome,
    MANGABACLAW_TEST_FAST: "1",
  };
  delete env.MANGABACLAW_HOME;
  delete env.MANGABACLAW_STATE_DIR;
  delete env.MANGABACLAW_CONFIG_PATH;
  delete env.VITEST;
  Object.assign(env, envOverrides);

  const entry = path.resolve(process.cwd(), "mangabaclaw.mjs");
  return spawnSync(process.execPath, [entry, ...args], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 60_000,
  });
}

describe("cli json stdout contract", () => {
  it.each([
    {
      name: "routed config get",
      args: ["config", "get", "gateway.port", "--json"],
      overrides: {},
    },
    {
      name: "Commander config get",
      args: ["config", "get", "gateway.port", "--json"],
      overrides: { MANGABACLAW_DISABLE_ROUTE_FIRST: "1" },
    },
    {
      name: "Nix config get",
      args: ["config", "get", "gateway.port", "--json"],
      overrides: { MANGABACLAW_NIX_MODE: "1" },
    },
    { name: "config schema", args: ["config", "schema"], overrides: {} },
    {
      name: "Nix config schema",
      args: ["config", "schema"],
      overrides: { MANGABACLAW_NIX_MODE: "1" },
    },
    { name: "config validate", args: ["config", "validate", "--json"], overrides: {} },
    {
      name: "Nix config validate",
      args: ["config", "validate", "--json"],
      overrides: { MANGABACLAW_NIX_MODE: "1" },
    },
  ])("does not initialize shared SQLite for $name", async (testCase) => {
    await withTempHome(
      async (tempHome) => {
        const stateDir = path.join(tempHome, "read-only-state");
        const configPath = path.join(tempHome, "read-only-mangabaclaw.json");
        await fs.writeFile(
          configPath,
          `${JSON.stringify({ gateway: { mode: "local", port: 18789 } })}\n`,
          "utf8",
        );

        const result = runBuiltCli(tempHome, testCase.args, {
          MANGABACLAW_CONFIG_PATH: configPath,
          MANGABACLAW_STATE_DIR: stateDir,
          ...testCase.overrides,
        });

        expect(result.status, result.stderr).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
        await expect(
          fs.access(path.join(stateDir, "state", "mangabaclaw.sqlite")),
        ).rejects.toMatchObject({
          code: "ENOENT",
        });
      },
      { prefix: "mangabaclaw-read-only-config-e2e-" },
    );
  });

  it.each([
    { name: "routed malformed config get", overrides: {} },
    {
      name: "Commander malformed config get",
      overrides: { MANGABACLAW_DISABLE_ROUTE_FIRST: "1" },
    },
  ])("returns actionable JSON without creating state for $name", async (testCase) => {
    await withTempHome(
      async (tempHome) => {
        const stateDir = path.join(tempHome, "read-only-state");
        const configPath = path.join(tempHome, "read-only-mangabaclaw.json");
        await fs.writeFile(configPath, "{}\n", "utf8");

        const result = runBuiltCli(
          tempHome,
          ["config", "get", "gateway.__proto__.token", "--json"],
          {
            MANGABACLAW_CONFIG_PATH: configPath,
            MANGABACLAW_STATE_DIR: stateDir,
            ...testCase.overrides,
          },
        );

        expect(result.status, result.stderr).toBe(1);
        expect(JSON.parse(result.stdout)).toMatchObject({
          ok: false,
          error: {
            type: "cli_error",
            message: expect.stringContaining("Invalid path segment: __proto__"),
          },
        });
        expect(result.stderr).toBe("");
        await expect(
          fs.access(path.join(stateDir, "state", "mangabaclaw.sqlite")),
        ).rejects.toMatchObject({
          code: "ENOENT",
        });
      },
      { prefix: "mangabaclaw-read-only-invalid-config-e2e-" },
    );
  });

  it.each([
    { name: "routed invalid config get", overrides: {} },
    {
      name: "Commander invalid config get",
      overrides: { MANGABACLAW_DISABLE_ROUTE_FIRST: "1" },
    },
  ])("reports invalid configuration as JSON without creating state for $name", async (testCase) => {
    await withTempHome(
      async (tempHome) => {
        const stateDir = path.join(tempHome, "read-only-state");
        const configPath = path.join(tempHome, "read-only-mangabaclaw.json");
        await fs.writeFile(
          configPath,
          `${JSON.stringify({ gateway: { bind: "not-a-supported-mode" } })}\n`,
          "utf8",
        );

        const result = runBuiltCli(tempHome, ["config", "get", "gateway.port", "--json"], {
          MANGABACLAW_CONFIG_PATH: configPath,
          MANGABACLAW_STATE_DIR: stateDir,
          ...testCase.overrides,
        });

        expect(result.status, result.stderr).toBe(1);
        expect(JSON.parse(result.stdout)).toMatchObject({
          ok: false,
          error: {
            type: "cli_error",
            message: expect.stringContaining("MangabaClaw config is invalid"),
          },
          issues: expect.arrayContaining([
            expect.objectContaining({ path: "gateway.bind", message: expect.any(String) }),
          ]),
        });
        expect(result.stderr).toBe("");
        await expect(
          fs.access(path.join(stateDir, "state", "mangabaclaw.sqlite")),
        ).rejects.toMatchObject({
          code: "ENOENT",
        });
      },
      { prefix: "mangabaclaw-read-only-invalid-snapshot-e2e-" },
    );
  });

  it.each([
    { name: "default service", inheritedProfile: undefined, inheritedStateName: ".mangabaclaw" },
    { name: "named service", inheritedProfile: "main", inheritedStateName: ".mangabaclaw-main" },
  ])("resolves the requested profile from inherited $name state", async (inherited) => {
    await withTempHome(
      async (tempHome) => {
        const inheritedStateDir = path.join(tempHome, inherited.inheritedStateName);
        const result = runBuiltCli(tempHome, ["--profile", "work", "config", "file"], {
          MANGABACLAW_PROFILE: inherited.inheritedProfile,
          MANGABACLAW_STATE_DIR: inheritedStateDir,
          MANGABACLAW_CONFIG_PATH: path.join(inheritedStateDir, "mangabaclaw.json"),
        });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout.trim()).toBe(
          path.join(tempHome, ".mangabaclaw-work", "mangabaclaw.json"),
        );
        await expect(fs.access(path.join(tempHome, ".mangabaclaw-work"))).rejects.toMatchObject({
          code: "ENOENT",
        });
      },
      { prefix: "mangabaclaw-profile-isolation-e2e-" },
    );
  });

  it("keeps default-profile exec approvals untouched for a scratch-state config query", async () => {
    await withTempHome(
      async (tempHome) => {
        const defaultStateDir = path.join(tempHome, ".mangabaclaw");
        const scratchStateDir = path.join(tempHome, "scratch-state");
        const approvalsPath = path.join(defaultStateDir, "exec-approvals.json");
        const approvals = '{"version":1,"approvals":{"demo":true}}\n';
        await fs.mkdir(defaultStateDir, { recursive: true });
        await fs.mkdir(scratchStateDir, { recursive: true });
        await fs.writeFile(approvalsPath, approvals, "utf8");

        const result = runBuiltCli(tempHome, ["config", "file"], {
          MANGABACLAW_STATE_DIR: scratchStateDir,
        });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout.trim()).toBe(path.join(scratchStateDir, "mangabaclaw.json"));
        await expect(fs.readFile(approvalsPath, "utf8")).resolves.toBe(approvals);
        await expect(fs.access(`${approvalsPath}.migrated`)).rejects.toMatchObject({
          code: "ENOENT",
        });
        await expect(
          fs.access(path.join(scratchStateDir, "exec-approvals.json")),
        ).rejects.toMatchObject({ code: "ENOENT" });
        await expect(
          fs.access(path.join(scratchStateDir, "state", "mangabaclaw.sqlite")),
        ).rejects.toMatchObject({ code: "ENOENT" });
      },
      { prefix: "mangabaclaw-read-only-state-e2e-" },
    );
  });

  it("keeps `update status --json` stdout parseable even with legacy doctor preflight inputs", async () => {
    await withTempHome(
      async (tempHome) => {
        const legacyDir = path.join(tempHome, ".clawdbot");
        await fs.mkdir(legacyDir, { recursive: true });
        await fs.writeFile(path.join(legacyDir, "clawdbot.json"), "{}", "utf8");

        const result = runBuiltCli(tempHome, ["update", "status", "--json", "--timeout", "1"]);

        expect(result.status).toBe(0);
        const stdout = result.stdout.trim();
        expect(stdout.length).toBeGreaterThan(0);
        const parsed = JSON.parse(stdout) as unknown;
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error(`Expected JSON object stdout, got: ${stdout}`);
        }
        expect(Object.keys(parsed).toSorted((a, b) => a.localeCompare(b))).toEqual([
          "availability",
          "channel",
          "update",
        ]);
        expect(stdout).not.toContain("Doctor warnings");
        expect(stdout).not.toContain("Doctor changes");
        expect(stdout).not.toContain("Config invalid");
      },
      { prefix: "mangabaclaw-json-e2e-" },
    );
  });

  it("rejects an explicitly empty update status timeout before emitting JSON", async () => {
    await withTempHome(
      async (tempHome) => {
        const result = runBuiltCli(tempHome, ["update", "status", "--json", "--timeout", ""]);

        expect(result.status, result.stderr).toBe(1);
        expect(JSON.parse(result.stdout)).toEqual({
          ok: false,
          error: {
            type: "cli_error",
            message: "--timeout must be a positive integer (seconds)",
          },
        });
        expect(result.stderr).toContain("--timeout must be a positive integer (seconds)");
      },
      { prefix: "mangabaclaw-update-empty-timeout-e2e-" },
    );
  });

  it("returns one canonical document for a command that previously failed on stderr only", async () => {
    await withTempHome(
      async (tempHome) => {
        const missingArchive = path.join(tempHome, "missing-backup.tar.gz");
        const result = runBuiltCli(tempHome, ["backup", "verify", missingArchive, "--json"]);

        expect(result.status).toBe(1);
        expect(JSON.parse(result.stdout)).toEqual({
          ok: false,
          error: {
            type: "cli_error",
            message: expect.stringContaining("missing-backup.tar.gz"),
          },
        });
      },
      { prefix: "mangabaclaw-json-failure-e2e-" },
    );
  });

  it("renders a missing TaskFlow as one canonical JSON document without stderr", async () => {
    await withTempHome(
      async (tempHome) => {
        const result = runBuiltCli(tempHome, ["tasks", "flow", "show", "missing-flow", "--json"]);

        expect(result.status, result.stderr).toBe(1);
        expect(result.stdout, result.stderr).not.toBe("");
        expect(JSON.parse(result.stdout)).toEqual({
          ok: false,
          error: {
            type: "cli_error",
            message:
              "TaskFlow not found: missing-flow. Run mangabaclaw tasks flow list to see recent flow ids.",
          },
        });
        expect(result.stderr).toBe("");
      },
      { prefix: "mangabaclaw-task-flow-json-failure-e2e-" },
    );
  });

  it.each([
    { name: "qr", command: ["qr"] },
    { name: "clawbot qr", command: ["clawbot", "qr"] },
  ])("renders conflicting $name options as one canonical JSON document", async (testCase) => {
    await withTempHome(
      async (tempHome) => {
        for (const conflict of [
          {
            args: ["--limited", "--voice-node"],
            message: "Use either --limited or --voice-node, not both.",
          },
          {
            args: ["--token", "test-token", "--password", "test-password"],
            message: "Use either --token or --password, not both.",
          },
        ]) {
          const result = runBuiltCli(tempHome, [...testCase.command, "--json", ...conflict.args], {
            MANGABACLAW_CONFIG_PATH: path.join(tempHome, "missing-mangabaclaw.json"),
            MANGABACLAW_STATE_DIR: path.join(tempHome, "isolated-state"),
          });

          expect(result.status, result.stderr).toBe(1);
          expect(JSON.parse(result.stdout)).toEqual({
            ok: false,
            error: { type: "cli_error", message: conflict.message },
          });
          expect(result.stdout).not.toContain("[mangabaclaw]");
          expect(result.stderr).toContain(conflict.message);
        }
      },
      { prefix: "mangabaclaw-qr-json-failure-e2e-" },
    );
  });

  it("renders sandbox explain validation failures as one canonical JSON document", async () => {
    await withTempHome(
      async (tempHome) => {
        const result = runBuiltCli(tempHome, [
          "sandbox",
          "explain",
          "--json",
          "--agent",
          "alpha",
          "--session",
          "agent:beta:main",
        ]);

        expect(result.status, result.stderr).toBe(1);
        expect(JSON.parse(result.stdout)).toEqual({
          ok: false,
          error: {
            type: "cli_error",
            message: 'Sandbox explain agent "alpha" does not match session agent "beta".',
          },
        });
        expect(result.stderr).toContain(
          'Sandbox explain agent "alpha" does not match session agent "beta".',
        );
      },
      { prefix: "mangabaclaw-sandbox-json-failure-e2e-" },
    );
  });

  it.each([
    {
      name: "status with an invalid duration in human mode",
      args: ["nodes", "status", "--last-connected", "not-a-duration"],
      message: "Invalid --last-connected: Invalid duration",
      human: true,
    },
    {
      name: "status with JSON before its invalid duration",
      args: ["nodes", "status", "--json", "--last-connected", "not-a-duration"],
      message: "Invalid --last-connected: Invalid duration",
    },
    {
      name: "status with JSON after its invalid duration",
      args: ["nodes", "status", "--last-connected", "not-a-duration", "--json"],
      message: "Invalid --last-connected: Invalid duration",
    },
    {
      name: "list with an invalid duration in human mode",
      args: ["nodes", "list", "--last-connected", "not-a-duration"],
      message: "Invalid --last-connected: Invalid duration",
      human: true,
    },
    {
      name: "list with JSON before its invalid duration",
      args: ["nodes", "list", "--json", "--last-connected", "not-a-duration"],
      message: "Invalid --last-connected: Invalid duration",
    },
    {
      name: "list with JSON after its invalid duration",
      args: ["nodes", "list", "--last-connected", "not-a-duration", "--json"],
      message: "Invalid --last-connected: Invalid duration",
    },
    {
      name: "invoke with an explicitly JSON blank node",
      args: ["nodes", "invoke", "--node", "   ", "--command", "canvas.eval", "--json"],
      message: "--node and --command required",
    },
    {
      name: "invoke with an implicitly JSON blank node",
      args: ["nodes", "invoke", "--node", "   ", "--command", "canvas.eval"],
      message: "--node and --command required",
    },
    {
      name: "invoke with an explicitly JSON blank command",
      args: ["nodes", "invoke", "--node", "mac-1", "--command", "   ", "--json"],
      message: "--node and --command required",
    },
    {
      name: "invoke with an implicitly JSON blank command",
      args: ["nodes", "invoke", "--node", "mac-1", "--command", "   "],
      message: "--node and --command required",
    },
    {
      name: "rename with a blank name",
      args: ["nodes", "rename", "--node", "mac-1", "--name", "   ", "--json"],
      message: "--name must not be empty",
    },
  ])("renders nodes $name through the shared validation owner", async (testCase) => {
    await withTempHome(
      async (tempHome) => {
        const denyNetwork = Buffer.from(
          `import net from "node:net";
           net.Socket.prototype.connect = function () { throw new Error("AUTOQA_NETWORK_FORBIDDEN"); };
           globalThis.fetch = async () => { throw new Error("AUTOQA_NETWORK_FORBIDDEN"); };`,
        ).toString("base64");
        const result = runBuiltCli(tempHome, testCase.args, {
          NODE_OPTIONS: `--permission --allow-fs-read=* --import=data:text/javascript;base64,${denyNetwork}`,
          NODE_DISABLE_COMPILE_CACHE: "1",
          MANGABACLAW_NO_RESPAWN: "1",
          MANGABACLAW_LOG_LEVEL: "silent",
          MANGABACLAW_STATE_DIR: path.join(tempHome, "isolated-state"),
          MANGABACLAW_CONFIG_PATH: path.join(tempHome, "missing-mangabaclaw.json"),
        });

        expect(result.status, result.stderr).toBe(1);
        if ("human" in testCase && testCase.human) {
          expect(result.stdout).toBe("");
          expect(result.stderr).toContain(`nodes ${testCase.args[1]} failed:`);
        } else {
          expect(JSON.parse(result.stdout)).toEqual({
            ok: false,
            error: {
              type: "cli_error",
              message: expect.stringContaining(testCase.message),
            },
          });
        }
        expect(result.stderr).toContain(testCase.message);
        expect(result.stderr).not.toContain("AUTOQA_NETWORK_FORBIDDEN");
      },
      { prefix: "mangabaclaw-nodes-json-failure-e2e-" },
    );
  });

  it.each([
    {
      name: "search with a leaf JSON flag",
      args: ["skills", "search", "fixture", "--json"],
      message: "ClawHub /api/v1/search failed (400): offline fixture",
    },
    {
      name: "search with a parent JSON flag",
      args: ["skills", "--json", "search", "fixture"],
      message: "ClawHub /api/v1/search failed (400): offline fixture",
    },
    {
      name: "list with a leaf JSON flag",
      args: ["skills", "list", "--agent", "", "--json"],
      message: "--agent must not be blank",
    },
    {
      name: "list with a parent JSON flag",
      args: ["skills", "--json", "list", "--agent", ""],
      message: "--agent must not be blank",
    },
    {
      name: "info with a leaf JSON flag",
      args: ["skills", "info", "fixture", "--agent", "", "--json"],
      message: "--agent must not be blank",
    },
    {
      name: "info with a parent JSON flag",
      args: ["skills", "--json", "info", "fixture", "--agent", ""],
      message: "--agent must not be blank",
    },
    {
      name: "check with a leaf JSON flag",
      args: ["skills", "check", "--agent", "", "--json"],
      message: "--agent must not be blank",
    },
    {
      name: "check with a parent JSON flag",
      args: ["skills", "--json", "check", "--agent", ""],
      message: "--agent must not be blank",
    },
    {
      name: "the default report after its agent flag",
      args: ["skills", "--agent", "", "--json"],
      message: "--agent must not be blank",
    },
    {
      name: "the default report before its agent flag",
      args: ["skills", "--json", "--agent", ""],
      message: "--agent must not be blank",
    },
  ])("returns one canonical JSON document when skills $name fails", async (testCase) => {
    await withTempHome(
      async (tempHome) => {
        const preload = `data:text/javascript,${encodeURIComponent(
          'globalThis.fetch = async () => new Response("offline fixture", { status: 400 });',
        )}`;
        const result = runBuiltCli(tempHome, testCase.args, {
          NODE_OPTIONS: `--import=${preload}`,
          MANGABACLAW_STATE_DIR: path.join(tempHome, "isolated-state"),
          MANGABACLAW_CONFIG_PATH: path.join(tempHome, "missing-mangabaclaw.json"),
        });

        expect(result.status, result.stderr).toBe(1);
        expect(JSON.parse(result.stdout)).toEqual({
          ok: false,
          error: {
            type: "cli_error",
            message: testCase.message,
          },
        });
        expect(result.stderr).toContain(testCase.message);
        expect(result.stderr.length).toBeLessThan(2_048);
      },
      { prefix: "mangabaclaw-skills-json-failure-e2e-" },
    );
  });

  it.each([
    { name: "off", debug: "0", includesCause: false },
    { name: "on", debug: "1", includesCause: true },
  ])("keeps skills search nested causes behind debug mode ($name)", async (testCase) => {
    await withTempHome(
      async (tempHome) => {
        const preload = `data:text/javascript,${encodeURIComponent(
          'globalThis.fetch = async () => new Response("not-json", { status: 200 });',
        )}`;
        const result = runBuiltCli(tempHome, ["skills", "search", "fixture"], {
          NODE_OPTIONS: `--import=${preload}`,
          MANGABACLAW_DEBUG: testCase.debug,
          MANGABACLAW_STATE_DIR: path.join(tempHome, "isolated-state"),
          MANGABACLAW_CONFIG_PATH: path.join(tempHome, "missing-mangabaclaw.json"),
        });

        expect(result.status, result.stderr).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("ClawHub /api/v1/search returned malformed JSON");
        expect(result.stderr.includes("Unexpected token")).toBe(testCase.includesCause);
      },
      { prefix: "mangabaclaw-skills-human-failure-e2e-" },
    );
  });

  it("returns one canonical document when docs search fails", async () => {
    await withTempHome(
      async (tempHome) => {
        const preload = `data:text/javascript,${encodeURIComponent(
          'globalThis.fetch = async () => { throw new Error("offline fixture"); };',
        )}`;
        const result = runBuiltCli(tempHome, ["docs", "offline", "--json"], {
          NODE_OPTIONS: `--import=${preload}`,
        });

        expect(result.status).toBe(1);
        expect(JSON.parse(result.stdout)).toEqual({
          ok: false,
          error: {
            type: "cli_error",
            message: "Docs search failed: offline fixture",
          },
        });
        expect(result.stderr).toContain("Docs search failed: offline fixture");
      },
      { prefix: "mangabaclaw-docs-json-failure-e2e-" },
    );
  });

  it("keeps Commander parse failures machine-readable in JSON mode", async () => {
    await withTempHome(
      async (tempHome) => {
        const result = runBuiltCli(tempHome, [
          "config",
          "get",
          "gateway.port",
          "--json",
          "--not-a-real-option",
        ]);

        expect(result.status).toBe(1);
        const payload = JSON.parse(result.stdout) as {
          ok: boolean;
          error: { type: string; message: string };
        };
        expect(payload).toMatchObject({
          ok: false,
          error: {
            type: "cli_error",
            message: expect.stringContaining("--not-a-real-option"),
          },
        });
        expect(payload.error.message).not.toMatch(/^error:/i);
        expect(result.stderr).toContain("--not-a-real-option");
      },
      { prefix: "mangabaclaw-json-parse-failure-e2e-" },
    );
  });

  it.each([
    {
      name: "unknown root",
      args: ["pairng"],
      diagnostic: 'MangabaClaw does not know the command "pairng".',
      suggestion: "mangabaclaw pairing",
    },
    {
      name: "unknown nested command",
      args: ["sessions", "lst"],
      diagnostic: 'MangabaClaw sessions has no command "lst".',
      suggestion: "mangabaclaw sessions list",
    },
    {
      name: "unknown nested command with a later argument",
      args: ["config", "gett", "gateway.port"],
      diagnostic: 'MangabaClaw config has no command "gett".',
      suggestion: "mangabaclaw config get",
    },
    {
      name: "unknown root before help",
      args: ["pairng", "--help"],
      diagnostic: 'MangabaClaw does not know the command "pairng".',
      suggestion: "mangabaclaw pairing",
    },
  ])("renders $name as actionable guidance", async (testCase) => {
    await withTempHome(
      async (tempHome) => {
        const result = runBuiltCli(tempHome, testCase.args);

        expect(result.status).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(testCase.diagnostic);
        expect(result.stderr).toContain(`Did you mean this?\n  ${testCase.suggestion}`);
        expect(result.stderr.split(testCase.diagnostic)).toHaveLength(2);
        expect(result.stderr.split(testCase.suggestion)).toHaveLength(2);
        expect(result.stderr).not.toContain("The CLI command failed.");
        expect(result.stderr).not.toContain("Could not start the CLI.");
        expect(result.stderr).not.toContain("MANGABACLAW_DEBUG");
        expect(result.stderr).not.toContain("mangabaclaw doctor");
        if (testCase.args.includes("--help")) {
          expect(result.stdout).not.toContain("Usage: mangabaclaw [options] [command]");
        }
      },
      { prefix: "mangabaclaw-unknown-command-e2e-" },
    );
  });

  it.each([
    {
      name: "unknown root",
      args: ["pairng", "--json"],
      diagnostic: 'MangabaClaw does not know the command "pairng".',
      suggestion: "mangabaclaw pairing",
    },
    {
      name: "unknown nested command",
      args: ["sessions", "lst", "--json"],
      diagnostic: 'MangabaClaw sessions has no command "lst".',
      suggestion: "mangabaclaw sessions list",
    },
  ])("reports $name once with structured JSON guidance", async (testCase) => {
    await withTempHome(
      async (tempHome) => {
        const result = runBuiltCli(tempHome, testCase.args);

        expect(result.status).toBe(1);
        const payload = JSON.parse(result.stdout) as {
          ok: boolean;
          error: { type: string; message: string };
        };
        expect(payload.ok).toBe(false);
        expect(payload.error.type).toBe("cli_error");
        expect(payload.error.message).toContain(testCase.diagnostic);
        expect(payload.error.message).not.toMatch(/^error:/i);
        expect(payload.error.message).toContain(`Did you mean this?\n  ${testCase.suggestion}`);
        expect(payload.error.message).not.toContain("MANGABACLAW_DEBUG");
        expect(payload.error.message).not.toContain("mangabaclaw doctor");
        expect(result.stderr).toContain(testCase.diagnostic);
        expect(result.stderr).toContain(`Did you mean this?\n  ${testCase.suggestion}`);
        expect(result.stderr.split(testCase.diagnostic)).toHaveLength(2);
        expect(result.stderr.split(testCase.suggestion)).toHaveLength(2);
        expect(result.stderr).not.toContain("The CLI command failed.");
        expect(result.stderr).not.toContain("Could not start the CLI.");
        expect(result.stderr).not.toContain("MANGABACLAW_DEBUG");
        expect(result.stderr).not.toContain("mangabaclaw doctor");
      },
      { prefix: "mangabaclaw-unknown-command-json-e2e-" },
    );
  });

  it("keeps parse-error JSON free of terminal controls when color is forced", async () => {
    await withTempHome(
      async (tempHome) => {
        const result = runBuiltCli(tempHome, ["sessions", "lst", "--json"], {
          FORCE_COLOR: "1",
        });

        expect(result.status).toBe(1);
        const payload = JSON.parse(result.stdout) as {
          error: { message: string };
        };
        expect(payload.error.message).toBe(
          'MangabaClaw sessions has no command "lst".\nDid you mean this?\n  mangabaclaw sessions list\nTry: mangabaclaw sessions --help\nDocs: https://docs.openclaw.ai/cli',
        );
        expect(payload.error.message).not.toMatch(/[\u001B\u0007]/u);
        expect(result.stdout).not.toContain("\\u001b");
        expect(result.stderr).toContain("\u001B[");
      },
      { prefix: "mangabaclaw-unknown-command-color-json-e2e-" },
    );
  });

  it("keeps representative success payload bytes unchanged", async () => {
    await withTempHome(
      async (tempHome) => {
        const configPath = path.join(tempHome, "mangabaclaw.json");
        await fs.writeFile(configPath, '{"gateway":{"port":28789}}\n', "utf8");
        const env = { MANGABACLAW_CONFIG_PATH: configPath };

        const getResult = runBuiltCli(tempHome, ["config", "get", "gateway.port", "--json"], env);
        const validateResult = runBuiltCli(tempHome, ["config", "validate", "--json"], env);

        expect(getResult.status, getResult.stderr).toBe(0);
        expect(getResult.stdout).toBe("28789\n");
        expect(validateResult.status, validateResult.stderr).toBe(0);
        expect(validateResult.stdout).toBe(
          `${JSON.stringify({ valid: true, path: configPath, warnings: [] })}\n`,
        );
      },
      { prefix: "mangabaclaw-json-success-bytes-e2e-" },
    );
  });

  it("keeps `config schema` stdout parseable at debug log level", async () => {
    await withTempHome(
      async (tempHome) => {
        const result = runBuiltCli(tempHome, ["config", "schema"], {
          MANGABACLAW_LOG_LEVEL: "debug",
        });

        expect(result.status).toBe(0);
        const parsed = JSON.parse(result.stdout) as {
          properties?: Record<string, unknown>;
        };
        expect(parsed.properties?.$schema).toEqual({ type: "string" });
        expect(result.stdout).not.toContain("possibly sensitive key found");
        expect(result.stderr).not.toContain("possibly sensitive key found");
      },
      { prefix: "mangabaclaw-config-schema-json-e2e-" },
    );
  });

  it("keeps `config validate --json` stdout parseable at debug log level", async () => {
    await withTempHome(
      async (tempHome) => {
        const configPath = path.join(tempHome, "mangabaclaw.json");
        await fs.writeFile(configPath, "{}", "utf8");
        const result = runBuiltCli(tempHome, ["config", "validate", "--json"], {
          MANGABACLAW_CONFIG_PATH: configPath,
          MANGABACLAW_LOG_LEVEL: "debug",
        });

        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({
          valid: true,
          path: configPath,
        });
        expect(result.stdout).not.toContain("possibly sensitive key found");
      },
      { prefix: "mangabaclaw-config-validate-json-e2e-" },
    );
  });

  it("returns structured Doctor lint output when llama.cpp is not bundled", async () => {
    await withTempHome(
      async (tempHome) => {
        const bundledPluginsDir = path.join(tempHome, "packaged-extensions");
        const memoryCoreDir = path.join(bundledPluginsDir, "memory-core");
        await fs.mkdir(memoryCoreDir, { recursive: true });
        await fs.writeFile(
          path.join(memoryCoreDir, "doctor-health-api.js"),
          [
            "export function registerMemoryCoreDoctorChecks(host) {",
            "  host.registerHealthCheck({",
            '    id: "memory-core/managed-local-embedding-setup",',
            '    kind: "plugin",',
            '    source: "memory-core",',
            '    description: "packaged Memory Core readiness fixture",',
            "    async detect() { return []; },",
            "  });",
            "}",
            "",
          ].join("\n"),
          "utf8",
        );

        const result = runBuiltCli(
          tempHome,
          [
            "doctor",
            "--lint",
            "--only",
            "memory-core/managed-local-embedding-setup",
            "--severity-min",
            "error",
            "--json",
          ],
          {
            MANGABACLAW_BUNDLED_PLUGINS_DIR: bundledPluginsDir,
            MANGABACLAW_TEST_TRUST_BUNDLED_PLUGINS_DIR: "1",
          },
        );

        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({
          ok: true,
          checksRun: 1,
          findings: [],
        });
      },
      { prefix: "mangabaclaw-doctor-packaged-json-e2e-" },
    );
  });
});
