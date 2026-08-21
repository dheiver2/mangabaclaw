// Run main tests cover CLI main entrypoint behavior and process error handling.
import { describe, expect, it } from "vitest";
import type { PluginManifestCommandAliasRegistry } from "../plugins/manifest-command-aliases.js";
import {
  resolveGatewayCatalogCommandPath,
  resolveGatewayRunPreBootstrapOptions,
} from "./gateway-run-argv.js";
import {
  rewriteUpdateFlagArgv,
  resolveMissingPluginCommandMessage,
  shouldHandleBareRoot,
  shouldEnsureCliPath,
  shouldStartProxyForCli,
  shouldUseRootHelpFastPath,
  shouldUseSetupOnboardConfigureHelpFastPath,
} from "./run-main-policy.js";
import { isGatewayRunFastPathArgv } from "./run-main.js";

const memoryWikiCommandAliasRegistry: PluginManifestCommandAliasRegistry = {
  plugins: [
    {
      id: "memory-wiki",
      enabledByDefault: true,
      commandAliases: [{ name: "wiki" }],
    },
  ],
};

const memoryCoreCommandAliasRegistry: PluginManifestCommandAliasRegistry = {
  plugins: [
    {
      id: "memory-core",
      commandAliases: [{ name: "dreaming", kind: "runtime-slash", cliCommand: "memory" }],
    },
  ],
};

const losslessClawToolRegistry: PluginManifestCommandAliasRegistry = {
  plugins: [
    {
      id: "lossless-claw",
      contracts: { tools: ["lcm_recent", "lcm_search"] },
    },
  ],
};

const browserCommandAliasRegistry: PluginManifestCommandAliasRegistry = {
  plugins: [
    {
      id: "browser",
      enabledByDefault: true,
      commandAliases: [{ name: "browser" }],
    },
  ],
};

const workboardCommandAliasRegistry: PluginManifestCommandAliasRegistry = {
  plugins: [
    {
      id: "workboard",
      commandAliases: [{ name: "workboard" }],
    },
  ],
};

describe("isGatewayRunFastPathArgv", () => {
  it("matches only plain gateway foreground starts without root options or help", () => {
    expect(isGatewayRunFastPathArgv(["node", "mangabaclaw", "gateway"])).toBe(true);
    expect(isGatewayRunFastPathArgv(["node", "mangabaclaw", "gateway", "--force"])).toBe(true);
    expect(isGatewayRunFastPathArgv(["node", "mangabaclaw", "gateway", "--port", "18789"])).toBe(true);
    expect(isGatewayRunFastPathArgv(["node", "mangabaclaw", "gateway", "--auth=none"])).toBe(true);
    expect(
      isGatewayRunFastPathArgv(["node", "mangabaclaw", "--no-color", "gateway", "--bind", "loopback"]),
    ).toBe(true);
    expect(isGatewayRunFastPathArgv(["node", "mangabaclaw", "gateway", "run"])).toBe(true);
    expect(
      isGatewayRunFastPathArgv(["node", "mangabaclaw", "gateway", "--log-level", "debug", "run"]),
    ).toBe(true);
    expect(
      isGatewayRunFastPathArgv(["node", "mangabaclaw", "gateway", "--log-level=debug", "run"]),
    ).toBe(true);
    expect(
      isGatewayRunFastPathArgv(["node", "mangabaclaw", "gateway", "run", "--raw-stream-path", "x"]),
    ).toBe(true);
    expect(isGatewayRunFastPathArgv(["node", "mangabaclaw", "gateway", "call", "health"])).toBe(false);
    expect(isGatewayRunFastPathArgv(["node", "mangabaclaw", "gateway", "--help"])).toBe(false);
    expect(isGatewayRunFastPathArgv(["node", "mangabaclaw", "gateway", "--port"])).toBe(false);
    expect(isGatewayRunFastPathArgv(["node", "mangabaclaw", "gateway", "--unknown"])).toBe(false);
  });

  it("keeps post-root log levels out of the gateway command path", () => {
    expect(
      resolveGatewayCatalogCommandPath([
        "node",
        "mangabaclaw",
        "gateway",
        "--log-level",
        "debug",
        "run",
      ]),
    ).toEqual(["gateway", "run"]);
    expect(
      resolveGatewayCatalogCommandPath([
        "node",
        "mangabaclaw",
        "gateway",
        "--log-level=debug",
        "restart-handoff",
        "capabilities",
      ]),
    ).toEqual(["gateway", "restart-handoff"]);
  });
});

describe("resolveGatewayRunPreBootstrapOptions", () => {
  it("resolves destructive gateway flags across fast and full Commander paths", () => {
    expect(
      resolveGatewayRunPreBootstrapOptions(["node", "mangabaclaw", "gateway", "run", "--force"]),
    ).toEqual({ force: true, reset: false });
    expect(
      resolveGatewayRunPreBootstrapOptions([
        "node",
        "mangabaclaw",
        "--log-level",
        "debug",
        "gateway",
        "run",
        "--force",
        "--reset",
      ]),
    ).toEqual({ force: true, reset: true });
  });

  it("does not treat malformed required option values as destructive flags", () => {
    expect(
      resolveGatewayRunPreBootstrapOptions(["node", "mangabaclaw", "gateway", "--token", "--force"]),
    ).toEqual({ force: false, reset: false });
  });
});

describe("rewriteUpdateFlagArgv", () => {
  it("leaves argv unchanged when --update is absent", () => {
    const argv = ["node", "entry.js", "status"];
    expect(rewriteUpdateFlagArgv(argv)).toBe(argv);
  });

  it("rewrites --update into the update command", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--update"])).toEqual([
      "node",
      "entry.js",
      "update",
    ]);
  });

  it("preserves global flags that appear before --update", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--profile", "p", "--update"])).toEqual([
      "node",
      "entry.js",
      "--profile",
      "p",
      "update",
    ]);
  });

  it("keeps update options after the rewritten command", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--update", "--json"])).toEqual([
      "node",
      "entry.js",
      "update",
      "--json",
    ]);
  });

  it("does not rewrite --update after -- positional terminator", () => {
    expect(
      rewriteUpdateFlagArgv(["node", "entry.js", "config", "set", "foo", "--", "--update"]),
    ).toEqual(["node", "entry.js", "config", "set", "foo", "--", "--update"]);
  });

  it("does not rewrite --update when a subcommand appears before it", () => {
    expect(
      rewriteUpdateFlagArgv(["node", "entry.js", "config", "set", "update.channel", "--update"]),
    ).toEqual(["node", "entry.js", "config", "set", "update.channel", "--update"]);
  });

  it("does not rewrite --update that appears as a value after a subcommand", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "config", "set", "foo", "--update"])).toEqual(
      ["node", "entry.js", "config", "set", "foo", "--update"],
    );
  });

  it("rewrites --update when it appears before any subcommand", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--update", "config", "set", "foo"])).toEqual(
      ["node", "entry.js", "update", "config", "set", "foo"],
    );
  });

  it("rewrites --update after root boolean flags", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--no-color", "--update"])).toEqual([
      "node",
      "entry.js",
      "--no-color",
      "update",
    ]);
  });

  it("does not skip root boolean flag followers as option values", () => {
    expect(rewriteUpdateFlagArgv(["node", "entry.js", "--no-color", "status", "--update"])).toEqual(
      ["node", "entry.js", "--no-color", "status", "--update"],
    );
  });
});

describe("shouldEnsureCliPath", () => {
  it("skips path bootstrap for help/version invocations", () => {
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "--help"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "-V"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "-v"])).toBe(false);
  });

  it("skips path bootstrap for read-only fast paths", () => {
    expect(shouldEnsureCliPath(["node", "mangabaclaw"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "--profile", "work"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "approvals"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "channels"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "cron"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "devices"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "plugins"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "mcp"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "status"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "--log-level", "debug", "status"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "sessions", "--json"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "config", "get", "update"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "models", "status", "--json"])).toBe(false);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "tools", "effective"])).toBe(false);
  });

  it("keeps path bootstrap for mutating or unknown commands", () => {
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "message", "send"])).toBe(true);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "voicecall", "status"])).toBe(true);
    expect(shouldEnsureCliPath(["node", "mangabaclaw", "acp", "-v"])).toBe(true);
  });
});

describe("shouldHandleBareRoot", () => {
  it("handles bare root invocations", () => {
    expect(shouldHandleBareRoot(["node", "mangabaclaw"])).toBe(true);
    expect(shouldHandleBareRoot(["node", "mangabaclaw", "--profile", "work"])).toBe(true);
    expect(shouldHandleBareRoot(["node", "mangabaclaw", "--dev"])).toBe(true);
  });

  it("does not handle help, version, or commands", () => {
    expect(shouldHandleBareRoot(["node", "mangabaclaw", "--help"])).toBe(false);
    expect(shouldHandleBareRoot(["node", "mangabaclaw", "-V"])).toBe(false);
    expect(shouldHandleBareRoot(["node", "mangabaclaw", "status"])).toBe(false);
  });
});

describe("shouldStartProxyForCli", () => {
  it("starts managed proxy routing for the --update shorthand", () => {
    expect(shouldStartProxyForCli(["node", "mangabaclaw", "--update"])).toBe(true);
    expect(shouldStartProxyForCli(["node", "mangabaclaw", "--profile", "p", "--update"])).toBe(true);
  });

  it("skips managed proxy routing for bare parent default help", () => {
    expect(shouldStartProxyForCli(["node", "mangabaclaw", "qa", "suite"])).toBe(false);
    expect(shouldStartProxyForCli(["node", "mangabaclaw", "plugins"])).toBe(false);
    expect(shouldStartProxyForCli(["node", "mangabaclaw", "channels"])).toBe(false);
    expect(shouldStartProxyForCli(["node", "mangabaclaw", "cron"])).toBe(false);
    expect(shouldStartProxyForCli(["node", "mangabaclaw", "devices"])).toBe(false);
    expect(shouldStartProxyForCli(["node", "mangabaclaw", "mcp"])).toBe(false);
  });

  it("skips managed proxy routing before shared-state SQLite maintenance", () => {
    expect(
      shouldStartProxyForCli(["node", "mangabaclaw", "doctor", "--state-sqlite", "compact", "--json"]),
    ).toBe(false);
    expect(
      shouldStartProxyForCli(["node", "mangabaclaw", "doctor", "--state-sqlite=compact", "--json"]),
    ).toBe(false);
    expect(shouldStartProxyForCli(["node", "mangabaclaw", "doctor", "--lint"])).toBe(true);
  });
});

describe("shouldUseRootHelpFastPath", () => {
  it("uses the fast path for root help only", () => {
    expect(shouldUseRootHelpFastPath(["node", "mangabaclaw", "--help"])).toBe(true);
    expect(shouldUseRootHelpFastPath(["node", "mangabaclaw", "--profile", "work", "-h"])).toBe(true);
    expect(shouldUseRootHelpFastPath(["node", "mangabaclaw", "help", "--help"])).toBe(true);
    expect(shouldUseRootHelpFastPath(["node", "mangabaclaw", "tools", "--help"])).toBe(true);
    expect(shouldUseRootHelpFastPath(["node", "mangabaclaw", "status", "--help"])).toBe(false);
    expect(shouldUseRootHelpFastPath(["node", "mangabaclaw", "--help", "status"])).toBe(false);
    expect(shouldUseRootHelpFastPath(["node", "mangabaclaw", "help", "gateway"])).toBe(false);
  });
});

describe("shouldUseSetupOnboardConfigureHelpFastPath", () => {
  it("uses the fast path only for setup, onboard, and configure help", () => {
    expect(
      shouldUseSetupOnboardConfigureHelpFastPath(["node", "mangabaclaw", "setup", "--help"]),
    ).toBe(true);
    expect(shouldUseSetupOnboardConfigureHelpFastPath(["node", "mangabaclaw", "onboard", "-h"])).toBe(
      true,
    );
    expect(
      shouldUseSetupOnboardConfigureHelpFastPath([
        "node",
        "mangabaclaw",
        "--profile",
        "work",
        "configure",
        "-h",
      ]),
    ).toBe(true);
    expect(
      shouldUseSetupOnboardConfigureHelpFastPath([
        "node",
        "mangabaclaw",
        "onboard",
        "status",
        "--help",
      ]),
    ).toBe(false);
    expect(
      shouldUseSetupOnboardConfigureHelpFastPath(["node", "mangabaclaw", "status", "--help"]),
    ).toBe(false);
    expect(
      shouldUseSetupOnboardConfigureHelpFastPath([
        "node",
        "mangabaclaw",
        "onboard",
        "--gateway-port",
        "--help",
      ]),
    ).toBe(false);
  });
});

describe("resolveMissingPluginCommandMessage", () => {
  it("explains plugins.allow misses for a bundled plugin command", () => {
    expect(
      resolveMissingPluginCommandMessage(
        "browser",
        {
          plugins: {
            allow: ["quietchat"],
          },
        },
        { registry: browserCommandAliasRegistry },
      ),
    ).toBe(
      'The `mangabaclaw browser` command is unavailable because `plugins.allow` excludes "browser". Add "browser" to `plugins.allow` if you want that bundled plugin CLI surface.',
    );
  });

  it("explains explicit bundled plugin disablement", () => {
    expect(
      resolveMissingPluginCommandMessage("browser", {
        plugins: {
          entries: {
            browser: {
              enabled: false,
            },
          },
        },
      }),
    ).toBe(
      "The `mangabaclaw browser` command is unavailable because `plugins.entries.browser.enabled=false`. Re-enable that entry if you want the bundled plugin CLI surface.",
    );
  });

  it("returns null when the bundled plugin command is already allowed", () => {
    expect(
      resolveMissingPluginCommandMessage("browser", {
        plugins: {
          allow: ["browser"],
        },
      }),
    ).toBeNull();
  });

  it("does not classify reserved non-plugin command roots as plugin allowlist misses", () => {
    for (const root of ["auth", "tool"]) {
      const message = resolveMissingPluginCommandMessage(root, {
        plugins: {
          allow: ["browser"],
        },
      });
      expect(message).toBeNull();
    }
  });

  it("explains that dreaming is a runtime slash command, not a CLI command", () => {
    const message = resolveMissingPluginCommandMessage(
      "dreaming",
      {},
      {
        registry: memoryCoreCommandAliasRegistry,
      },
    );
    expect(message).toBe(
      '"dreaming" is a runtime slash command (/dreaming), not a CLI command. It is provided by the "memory-core" plugin. Use `mangabaclaw memory` for related CLI operations, or `/dreaming` in a chat session.',
    );
  });

  it("returns the runtime command message even when plugins.allow is set", () => {
    const message = resolveMissingPluginCommandMessage(
      "dreaming",
      {
        plugins: {
          allow: ["memory-core"],
        },
      },
      {
        registry: memoryCoreCommandAliasRegistry,
      },
    );
    expect(message).toContain("runtime slash command");
    expect(message).not.toContain("plugins.allow");
  });

  it("points command names in plugins.allow at their parent plugin", () => {
    const message = resolveMissingPluginCommandMessage(
      "dreaming",
      {
        plugins: {
          allow: ["dreaming"],
        },
      },
      {
        registry: memoryCoreCommandAliasRegistry,
      },
    );
    expect(message).toBe(
      '"dreaming" is not a plugin; it is a command provided by the "memory-core" plugin. Add "memory-core" to `plugins.allow` instead of "dreaming".',
    );
  });

  it("explains disabled-by-default parent plugins for CLI command aliases", () => {
    const message = resolveMissingPluginCommandMessage(
      "voicecall",
      {},
      {
        registry: {
          plugins: [
            {
              id: "voice-call",
              commandAliases: [{ name: "voicecall" }],
            },
          ],
        },
      },
    );

    expect(message).toContain('"voice-call" plugin');
    expect(message).toContain("disabled by default");
    expect(message).toContain("mangabaclaw plugins enable voice-call");
  });

  it("prefers CLI ownership for plugins that also register a slash command", () => {
    const message = resolveMissingPluginCommandMessage(
      "workboard",
      {},
      { registry: workboardCommandAliasRegistry },
    );

    expect(message).toBe(
      'The `mangabaclaw workboard` command is provided by the "workboard" plugin, but that bundled plugin is disabled by default. Run `mangabaclaw plugins enable workboard` to enable that CLI surface.',
    );
  });

  it("returns null for CLI command aliases when disabled-by-default parent plugins are enabled", () => {
    const message = resolveMissingPluginCommandMessage(
      "voicecall",
      {
        plugins: {
          entries: {
            "voice-call": {
              enabled: true,
            },
          },
        },
      },
      {
        registry: {
          plugins: [
            {
              id: "voice-call",
              commandAliases: [{ name: "voicecall" }],
            },
          ],
        },
      },
    );

    expect(message).toBeNull();
  });

  it("explains parent plugin disablement for runtime command aliases", () => {
    const message = resolveMissingPluginCommandMessage(
      "dreaming",
      {
        plugins: {
          entries: {
            "memory-core": {
              enabled: false,
            },
          },
        },
      },
      {
        registry: memoryCoreCommandAliasRegistry,
      },
    );
    expect(message).toContain("plugins.entries.memory-core.enabled=false");
    expect(message).not.toContain("runtime slash command");
  });

  it("allows CLI commands when their parent plugin is in plugins.allow", () => {
    const message = resolveMissingPluginCommandMessage(
      "wiki",
      {
        plugins: {
          allow: ["memory-wiki"],
        },
      },
      { registry: memoryWikiCommandAliasRegistry },
    );
    expect(message).toBeNull();
  });

  it("blocks CLI commands when parent plugin is NOT in plugins.allow", () => {
    const message = resolveMissingPluginCommandMessage(
      "wiki",
      {
        plugins: {
          allow: ["quietchat"],
        },
      },
      { registry: memoryWikiCommandAliasRegistry },
    );
    expect(message).toContain('"memory-wiki"');
    expect(message).toContain("plugins.allow");
  });

  it("identifies an agent tool name and points the user at model tool-use", () => {
    const message = resolveMissingPluginCommandMessage(
      "lcm_recent",
      {
        plugins: {
          allow: ["lossless-claw"],
        },
      },
      { registry: losslessClawToolRegistry },
    );
    if (message === null) {
      throw new Error("expected missing plugin command message");
    }
    expect(message).toBe(
      '"lcm_recent" is an agent tool available from the "lossless-claw" plugin, not a CLI subcommand. Use it from an agent turn (model tool-use), not the CLI. Run `mangabaclaw --help` to see available CLI subcommands.',
    );
  });

  it("matches agent tool names case-insensitively", () => {
    const message = resolveMissingPluginCommandMessage("LCM_Recent", undefined, {
      registry: losslessClawToolRegistry,
    });
    if (message === null) {
      throw new Error("expected missing plugin command message");
    }
    expect(message).toContain("agent tool");
    expect(message).toContain('"lossless-claw"');
  });

  it("returns null for unknown names excluded by plugins.allow", () => {
    const message = resolveMissingPluginCommandMessage(
      "totally-unknown",
      {
        plugins: {
          allow: ["quietchat"],
        },
      },
      { registry: losslessClawToolRegistry },
    );
    expect(message).toBeNull();
  });

  it("points metadata-only CLI roots in plugins.allow at their parent plugin", () => {
    const message = resolveMissingPluginCommandMessage(
      "qa",
      {
        plugins: {
          allow: ["browser"],
        },
      },
      {
        resolveCliCommandSurfaceOwner: () => "qa-lab",
      },
    );
    expect(message).toContain('"qa" is not a plugin');
    expect(message).toContain('"qa-lab"');
    expect(message).toContain('Add "qa-lab" to `plugins.allow` instead of "qa"');
  });

  it("does not attribute a tool to an owning plugin excluded by plugins.allow", () => {
    // The owning plugin is denied via plugins.allow, so the manifest-declared
    // tool is not available through the owning plugin. Tool names are not CLI
    // command surfaces, so do not suggest adding the tool name to plugins.allow.
    const message = resolveMissingPluginCommandMessage(
      "lcm_recent",
      {
        plugins: {
          allow: ["quietchat"],
        },
      },
      { registry: losslessClawToolRegistry },
    );
    expect(message).toBeNull();
  });

  it("does not attribute a tool to an owning plugin disabled via plugins.entries", () => {
    const message = resolveMissingPluginCommandMessage(
      "lcm_recent",
      {
        plugins: {
          entries: {
            "lossless-claw": { enabled: false },
          },
        },
      },
      { registry: losslessClawToolRegistry },
    );
    // entries.<id>.enabled = false on the OWNING plugin invalidates the
    // plugin-tool attribution. With no allow filter on the bare name the
    // diagnostic returns null (no actionable message); callers handle that
    // as "not a recognised plugin command".
    expect(message).toBeNull();
  });

  it("uses softer 'may be provided by' wording for manifest-only availability", () => {
    // Some runtime gates (per-account enabled, per-tool toggles in the Feishu
    // family etc.) cannot be expressed as manifest configSignals, so the
    // runtime resolver reports availability: "manifest-only" when ownership is
    // only manifest-provable. The diagnostic must avoid asserting "registered
    // by" in that case.
    const manifestOnlyOwner = {
      toolName: "feishu_chat",
      pluginId: "feishu",
      availability: "manifest-only" as const,
    };
    const message = resolveMissingPluginCommandMessage("feishu_chat", undefined, {
      resolveToolOwner: () => manifestOnlyOwner,
    });
    if (message === null) {
      throw new Error("expected missing plugin command message");
    }
    expect(message).toBe(
      '"feishu_chat" may be provided by the "feishu" plugin as an agent tool, not a CLI subcommand. Run `mangabaclaw --help` to see available CLI subcommands.',
    );
  });
});
