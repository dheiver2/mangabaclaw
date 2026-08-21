// Argv tests cover CLI argument parsing helpers and platform-specific normalization.
import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPositionalsWithRootOptions,
  getCommandPathWithRootOptions,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasFlag,
  isHelpOrVersionInvocation,
  isRootHelpInvocation,
  isRootVersionInvocation,
  isSimpleCommandHelpInvocation,
  normalizeGeneratedHelpCommandArgv,
  normalizeRootHelpTargetArgv,
  normalizeRootLogLevelArgv,
  normalizeRootNoColorArgv,
} from "./argv.js";

describe("argv helpers", () => {
  it.each([
    {
      name: "known command group help command help flag",
      argv: ["node", "mangabaclaw", "backup", "help", "--help"],
      expected: ["node", "mangabaclaw", "backup", "help"],
    },
    {
      name: "known command group help command short help flag",
      argv: ["node", "mangabaclaw", "--profile", "work", "backup", "help", "-h"],
      expected: ["node", "mangabaclaw", "--profile", "work", "backup", "help"],
    },
    {
      name: "leaf positional help remains untouched",
      argv: ["node", "mangabaclaw", "docs", "help", "--help"],
      expected: ["node", "mangabaclaw", "docs", "help", "--help"],
    },
    {
      name: "known command group help target",
      argv: ["node", "mangabaclaw", "plugins", "help", "list"],
      expected: ["node", "mangabaclaw", "plugins", "list", "--help"],
    },
    {
      name: "known command group help target help flag",
      argv: ["node", "mangabaclaw", "plugins", "help", "list", "--help"],
      expected: ["node", "mangabaclaw", "plugins", "list", "--help"],
    },
    {
      name: "unknown plugin command group help target",
      argv: ["node", "mangabaclaw", "external-plugin", "help", "inspect"],
      expected: ["node", "mangabaclaw", "external-plugin", "inspect", "--help"],
    },
    {
      name: "unknown plugin command group help target help flag",
      argv: ["node", "mangabaclaw", "external-plugin", "help", "inspect", "--help"],
      expected: ["node", "mangabaclaw", "external-plugin", "inspect", "--help"],
    },
    {
      name: "generated help target with trailing root option",
      argv: ["node", "mangabaclaw", "memory", "help", "status", "--no-color"],
      expected: ["node", "mangabaclaw", "--no-color", "memory", "status", "--help"],
    },
    {
      name: "extra help positionals remain untouched",
      argv: ["node", "mangabaclaw", "backup", "help", "missing", "extra", "--help"],
      expected: ["node", "mangabaclaw", "backup", "help", "missing", "extra", "--help"],
    },
    {
      name: "terminator help flag remains untouched",
      argv: ["node", "mangabaclaw", "backup", "help", "--", "--help"],
      expected: ["node", "mangabaclaw", "backup", "help", "--", "--help"],
    },
  ])("normalizes generated help commands: $name", ({ argv, expected }) => {
    expect(normalizeGeneratedHelpCommandArgv(argv)).toEqual(expected);
  });

  it.each([
    {
      name: "root help target",
      argv: ["node", "mangabaclaw", "help", "plugins"],
      expected: ["node", "mangabaclaw", "plugins", "--help"],
    },
    {
      name: "root help target with help flag",
      argv: ["node", "mangabaclaw", "help", "plugins", "--help"],
      expected: ["node", "mangabaclaw", "plugins", "--help"],
    },
    {
      name: "root option before help target",
      argv: ["node", "mangabaclaw", "--profile", "work", "help", "memory"],
      expected: ["node", "mangabaclaw", "--profile", "work", "memory", "--help"],
    },
    {
      name: "bare root help remains untouched",
      argv: ["node", "mangabaclaw", "help"],
      expected: ["node", "mangabaclaw", "help"],
    },
    {
      name: "root help self-help remains untouched",
      argv: ["node", "mangabaclaw", "help", "--help"],
      expected: ["node", "mangabaclaw", "help", "--help"],
    },
    {
      name: "nested root help target",
      argv: ["node", "mangabaclaw", "help", "plugins", "list"],
      expected: ["node", "mangabaclaw", "plugins", "list", "--help"],
    },
    {
      name: "nested root help target with help flag",
      argv: ["node", "mangabaclaw", "help", "plugins", "list", "--help"],
      expected: ["node", "mangabaclaw", "plugins", "list", "--help"],
    },
    {
      name: "nested root help target with trailing root option",
      argv: ["node", "mangabaclaw", "help", "memory", "status", "--no-color"],
      expected: ["node", "mangabaclaw", "--no-color", "memory", "status", "--help"],
    },
  ])("normalizes root help targets: $name", ({ argv, expected }) => {
    expect(normalizeRootHelpTargetArgv(argv)).toEqual(expected);
  });

  it.each([
    {
      name: "subcommand trailing no-color",
      argv: ["node", "mangabaclaw", "doctor", "--no-color", "--post-upgrade", "--json"],
      expected: ["node", "mangabaclaw", "--no-color", "doctor", "--post-upgrade", "--json"],
    },
    {
      name: "keeps existing root options first",
      argv: ["node", "mangabaclaw", "--profile", "work", "doctor", "--no-color", "--lint", "--json"],
      expected: [
        "node",
        "mangabaclaw",
        "--profile",
        "work",
        "--no-color",
        "doctor",
        "--lint",
        "--json",
      ],
    },
    {
      name: "keeps no-color after possible command option value",
      argv: ["node", "mangabaclaw", "doctor", "--lint", "--json", "--no-color"],
      expected: ["node", "mangabaclaw", "doctor", "--lint", "--json", "--no-color"],
    },
    {
      name: "flag terminator leaves no-color positional",
      argv: ["node", "mangabaclaw", "doctor", "--", "--no-color"],
      expected: ["node", "mangabaclaw", "doctor", "--", "--no-color"],
    },
    {
      name: "command option value remains literal",
      argv: ["node", "mangabaclaw", "agent", "--message", "--no-color"],
      expected: ["node", "mangabaclaw", "agent", "--message", "--no-color"],
    },
    {
      name: "assigned command option value does not block no-color",
      argv: ["node", "mangabaclaw", "agent", "--message=hello", "--no-color"],
      expected: ["node", "mangabaclaw", "--no-color", "agent", "--message=hello"],
    },
  ])("normalizes root --no-color before command parsing: $name", ({ argv, expected }) => {
    expect(normalizeRootNoColorArgv(argv)).toEqual(expected);
  });

  it("allows final command metadata to lift no-color after boolean command flags", () => {
    const argv = ["node", "mangabaclaw", "doctor", "--lint", "--json", "--no-color"];

    expect(
      normalizeRootNoColorArgv(argv, {
        shouldPreserveNoColor: ({ remainingArgs, noColorIndex }) =>
          remainingArgs[noColorIndex - 1] === "--message",
      }),
    ).toEqual(["node", "mangabaclaw", "--no-color", "doctor", "--lint", "--json"]);
  });

  it.each([
    {
      name: "subcommand trailing log-level",
      argv: ["node", "mangabaclaw", "doctor", "--log-level", "debug", "--json"],
      expected: ["node", "mangabaclaw", "--log-level", "debug", "doctor", "--json"],
    },
    {
      name: "subcommand trailing log-level equals form",
      argv: ["node", "mangabaclaw", "doctor", "--log-level=trace", "--json"],
      expected: ["node", "mangabaclaw", "--log-level=trace", "doctor", "--json"],
    },
    {
      name: "keeps existing root options first",
      argv: ["node", "mangabaclaw", "--profile", "work", "doctor", "--log-level", "debug"],
      expected: ["node", "mangabaclaw", "--profile", "work", "--log-level", "debug", "doctor"],
    },
    {
      name: "keeps log-level after possible command option value",
      argv: ["node", "mangabaclaw", "agent", "--message", "--log-level", "debug"],
      expected: ["node", "mangabaclaw", "agent", "--message", "--log-level", "debug"],
    },
    {
      name: "flag terminator leaves log-level positional",
      argv: ["node", "mangabaclaw", "nodes", "run", "--", "--log-level", "debug"],
      expected: ["node", "mangabaclaw", "nodes", "run", "--", "--log-level", "debug"],
    },
    {
      name: "missing value remains command scoped",
      argv: ["node", "mangabaclaw", "doctor", "--log-level", "--json"],
      expected: ["node", "mangabaclaw", "doctor", "--log-level", "--json"],
    },
  ])("normalizes root --log-level before command parsing: $name", ({ argv, expected }) => {
    expect(normalizeRootLogLevelArgv(argv)).toEqual(expected);
  });

  it("allows final command metadata to lift log-level after boolean command flags", () => {
    const argv = ["node", "mangabaclaw", "doctor", "--lint", "--json", "--log-level", "debug"];

    expect(
      normalizeRootLogLevelArgv(argv, {
        shouldPreserveLogLevel: ({ remainingArgs, logLevelIndex }) =>
          remainingArgs[logLevelIndex - 1] === "--message",
      }),
    ).toEqual(["node", "mangabaclaw", "--log-level", "debug", "doctor", "--lint", "--json"]);
  });

  it("preserves log-level when final command metadata owns the option", () => {
    const argv = ["node", "mangabaclaw", "plugin-cmd", "--log-level", "debug"];

    expect(
      normalizeRootLogLevelArgv(argv, {
        shouldPreserveLogLevel: ({ remainingArgs, logLevelIndex }) =>
          remainingArgs[logLevelIndex] === "--log-level",
      }),
    ).toEqual(argv);
  });

  it.each([
    {
      name: "root help command",
      argv: ["node", "mangabaclaw", "help"],
      expected: true,
    },
    {
      name: "root help command with target",
      argv: ["node", "mangabaclaw", "help", "matrix"],
      expected: true,
    },
    {
      name: "nested help command",
      argv: ["node", "mangabaclaw", "matrix", "encryption", "help"],
      expected: true,
    },
    {
      name: "known subcommand root help command",
      argv: ["node", "mangabaclaw", "config", "help"],
      expected: true,
    },
    {
      name: "known leaf command positional help",
      argv: ["node", "mangabaclaw", "docs", "help"],
      expected: false,
    },
    {
      name: "known subcommand leaf positional help",
      argv: ["node", "mangabaclaw", "config", "set", "some.path", "help"],
      expected: false,
    },
    {
      name: "unknown plugin command help",
      argv: ["node", "mangabaclaw", "external-plugin", "tools", "help"],
      expected: true,
    },
    {
      name: "help flag",
      argv: ["node", "mangabaclaw", "matrix", "encryption", "--help"],
      expected: true,
    },
    {
      name: "help as option value",
      argv: ["node", "mangabaclaw", "agent", "--message", "help"],
      expected: false,
    },
    {
      name: "help after terminator",
      argv: ["node", "mangabaclaw", "nodes", "invoke", "--", "help"],
      expected: false,
    },
    {
      name: "help flag after terminator",
      argv: ["node", "mangabaclaw", "nodes", "invoke", "--", "--help"],
      expected: false,
    },
    {
      name: "version flag after terminator",
      argv: ["node", "mangabaclaw", "nodes", "invoke", "--", "--version"],
      expected: false,
    },
    {
      name: "root version flag",
      argv: ["node", "mangabaclaw", "--version"],
      expected: true,
    },
    {
      name: "root short version flag",
      argv: ["node", "mangabaclaw", "-V"],
      expected: true,
    },
    {
      name: "root version alias after profile",
      argv: ["node", "mangabaclaw", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "root version flag after profile",
      argv: ["node", "mangabaclaw", "--profile", "work", "--version"],
      expected: true,
    },
    {
      name: "version-pinned skill install",
      argv: ["node", "mangabaclaw", "skills", "install", "@owner/weather", "--version", "1.2.3"],
      expected: false,
    },
    {
      name: "version-pinned skill verification",
      argv: ["node", "mangabaclaw", "skills", "verify", "@owner/weather", "--version", "1.2.3"],
      expected: false,
    },
    {
      name: "equals-form version-pinned skill install",
      argv: ["node", "mangabaclaw", "skills", "install", "@owner/weather", "--version=1.2.3"],
      expected: false,
    },
    {
      name: "profiled version-pinned skill verification",
      argv: [
        "node",
        "mangabaclaw",
        "--profile",
        "work",
        "skills",
        "verify",
        "@owner/weather",
        "--version",
        "1.2.3",
      ],
      expected: false,
    },
    {
      name: "help for a version-pinned skill command",
      argv: [
        "node",
        "mangabaclaw",
        "skills",
        "verify",
        "@owner/weather",
        "--version",
        "1.2.3",
        "--help",
      ],
      expected: true,
    },
    {
      name: "unknown root option does not turn version into root help",
      argv: ["node", "mangabaclaw", "--unknown", "--version"],
      expected: false,
    },
  ])("detects help/version invocations: $name", ({ argv, expected }) => {
    expect(isHelpOrVersionInvocation(argv)).toBe(expected);
  });

  it.each([
    {
      name: "root --version",
      argv: ["node", "mangabaclaw", "--version"],
      expected: true,
    },
    {
      name: "root -V",
      argv: ["node", "mangabaclaw", "-V"],
      expected: true,
    },
    {
      name: "root -v alias with profile",
      argv: ["node", "mangabaclaw", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "subcommand version flag",
      argv: ["node", "mangabaclaw", "status", "--version"],
      expected: false,
    },
    {
      name: "unknown root flag with version",
      argv: ["node", "mangabaclaw", "--unknown", "--version"],
      expected: false,
    },
  ])("detects root-only version invocations: $name", ({ argv, expected }) => {
    expect(isRootVersionInvocation(argv)).toBe(expected);
  });

  it.each([
    {
      name: "root --help",
      argv: ["node", "mangabaclaw", "--help"],
      expected: true,
    },
    {
      name: "root -h",
      argv: ["node", "mangabaclaw", "-h"],
      expected: true,
    },
    {
      name: "root --help with profile",
      argv: ["node", "mangabaclaw", "--profile", "work", "--help"],
      expected: true,
    },
    {
      name: "subcommand --help",
      argv: ["node", "mangabaclaw", "status", "--help"],
      expected: false,
    },
    {
      name: "help before subcommand token",
      argv: ["node", "mangabaclaw", "--help", "status"],
      expected: false,
    },
    {
      name: "help after -- terminator",
      argv: ["node", "mangabaclaw", "nodes", "invoke", "--", "device.status", "--help"],
      expected: false,
    },
    {
      name: "unknown root flag before help",
      argv: ["node", "mangabaclaw", "--unknown", "--help"],
      expected: false,
    },
    {
      name: "unknown root flag after help",
      argv: ["node", "mangabaclaw", "--help", "--unknown"],
      expected: false,
    },
  ])("detects root-only help invocations: $name", ({ argv, expected }) => {
    expect(isRootHelpInvocation(argv)).toBe(expected);
  });

  it.each([
    {
      name: "single command with trailing flag",
      argv: ["node", "mangabaclaw", "status", "--json"],
      expected: ["status"],
    },
    {
      name: "two-part command",
      argv: ["node", "mangabaclaw", "agents", "list"],
      expected: ["agents", "list"],
    },
    {
      name: "terminator cuts parsing",
      argv: ["node", "mangabaclaw", "status", "--", "ignored"],
      expected: ["status"],
    },
  ])("extracts command path: $name", ({ argv, expected }) => {
    expect(getCommandPathWithRootOptions(argv, 2)).toEqual(expected);
  });

  it("extracts command path while skipping known root option values", () => {
    expect(
      getCommandPathWithRootOptions(
        [
          "node",
          "mangabaclaw",
          "--profile",
          "work",
          "--container",
          "demo",
          "--no-color",
          "config",
          "validate",
        ],
        2,
      ),
    ).toEqual(["config", "validate"]);
  });

  it("limits simple help fast paths to root options, a command, and help", () => {
    const commands = new Set(["setup"]);
    expect(
      isSimpleCommandHelpInvocation(
        ["node", "mangabaclaw", "--profile", "work", "setup", "--help"],
        commands,
      ),
    ).toBe(true);
    expect(
      isSimpleCommandHelpInvocation(
        ["node", "mangabaclaw", "setup", "--workspace", "--help"],
        commands,
      ),
    ).toBe(false);
    expect(
      isSimpleCommandHelpInvocation(
        ["node", "mangabaclaw", "setup", "--profile", "work", "--help"],
        commands,
      ),
    ).toBe(false);
    expect(isSimpleCommandHelpInvocation(["node", "mangabaclaw", "--help", "setup"], commands)).toBe(
      false,
    );
  });

  it("extracts routed config get positionals with interleaved root options", () => {
    expect(
      getCommandPositionalsWithRootOptions(
        ["node", "mangabaclaw", "config", "get", "--log-level", "debug", "update.channel", "--json"],
        {
          commandPath: ["config", "get"],
          booleanFlags: ["--json"],
        },
      ),
    ).toEqual(["update.channel"]);
  });

  it("extracts routed config unset positionals with interleaved root options", () => {
    expect(
      getCommandPositionalsWithRootOptions(
        ["node", "mangabaclaw", "config", "unset", "--profile", "work", "update.channel"],
        {
          commandPath: ["config", "unset"],
        },
      ),
    ).toEqual(["update.channel"]);
  });

  it("returns null when routed command sees unknown options", () => {
    expect(
      getCommandPositionalsWithRootOptions(
        ["node", "mangabaclaw", "config", "get", "--mystery", "value", "update.channel"],
        {
          commandPath: ["config", "get"],
          booleanFlags: ["--json"],
        },
      ),
    ).toBeNull();
  });

  it.each([
    {
      name: "returns first command token",
      argv: ["node", "mangabaclaw", "agents", "list"],
      expected: "agents",
    },
    {
      name: "returns null when no command exists",
      argv: ["node", "mangabaclaw"],
      expected: null,
    },
    {
      name: "skips known root option values",
      argv: ["node", "mangabaclaw", "--log-level", "debug", "status"],
      expected: "status",
    },
  ])("returns primary command: $name", ({ argv, expected }) => {
    expect(getPrimaryCommand(argv)).toBe(expected);
  });

  it.each([
    {
      name: "detects flag before terminator",
      argv: ["node", "mangabaclaw", "status", "--json"],
      flag: "--json",
      expected: true,
    },
    {
      name: "ignores flag after terminator",
      argv: ["node", "mangabaclaw", "--", "--json"],
      flag: "--json",
      expected: false,
    },
  ])("parses boolean flags: $name", ({ argv, flag, expected }) => {
    expect(hasFlag(argv, flag)).toBe(expected);
  });

  it.each([
    {
      name: "value in next token",
      argv: ["node", "mangabaclaw", "status", "--timeout", "5000"],
      expected: "5000",
    },
    {
      name: "value in equals form",
      argv: ["node", "mangabaclaw", "status", "--timeout=2500"],
      expected: "2500",
    },
    {
      name: "missing value",
      argv: ["node", "mangabaclaw", "status", "--timeout"],
      expected: null,
    },
    {
      name: "next token is another flag",
      argv: ["node", "mangabaclaw", "status", "--timeout", "--json"],
      expected: null,
    },
    {
      name: "flag appears after terminator",
      argv: ["node", "mangabaclaw", "--", "--timeout=99"],
      expected: undefined,
    },
    {
      name: "repeated flag uses final value",
      argv: ["node", "mangabaclaw", "status", "--timeout", "100", "--timeout=200"],
      expected: "200",
    },
    {
      name: "missing repeated value remains invalid",
      argv: ["node", "mangabaclaw", "status", "--timeout", "--timeout", "200"],
      expected: null,
    },
  ])("extracts flag values: $name", ({ argv, expected }) => {
    expect(getFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "mangabaclaw", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "mangabaclaw", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "mangabaclaw", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it.each([
    {
      name: "missing flag",
      argv: ["node", "mangabaclaw", "status"],
      expected: undefined,
    },
    {
      name: "missing value",
      argv: ["node", "mangabaclaw", "status", "--timeout"],
      expected: null,
    },
    {
      name: "valid positive integer",
      argv: ["node", "mangabaclaw", "status", "--timeout", "5000"],
      expected: 5000,
    },
    {
      name: "valid signed decimal positive integer",
      argv: ["node", "mangabaclaw", "status", "--timeout", "+5000"],
      expected: 5000,
    },
    {
      name: "invalid integer",
      argv: ["node", "mangabaclaw", "status", "--timeout", "nope"],
      expected: null,
    },
    {
      name: "non-decimal integer",
      argv: ["node", "mangabaclaw", "status", "--timeout", "0x10"],
      expected: null,
    },
    {
      name: "partial integer",
      argv: ["node", "mangabaclaw", "status", "--timeout", "5s"],
      expected: null,
    },
    {
      name: "zero",
      argv: ["node", "mangabaclaw", "status", "--timeout", "0"],
      expected: null,
    },
    {
      name: "negative integer",
      argv: ["node", "mangabaclaw", "status", "--timeout", "-5"],
      expected: null,
    },
    {
      name: "repeated value uses final valid integer",
      argv: ["node", "mangabaclaw", "status", "--timeout", "nope", "--timeout", "5000"],
      expected: 5000,
    },
    {
      name: "repeated value rejects final invalid integer",
      argv: ["node", "mangabaclaw", "status", "--timeout", "5000", "--timeout", "nope"],
      expected: null,
    },
  ])("parses positive integer flag values: $name", ({ argv, expected }) => {
    expect(getPositiveIntFlagValue(argv, "--timeout")).toBe(expected);
  });

  it.each([
    {
      name: "keeps plain node argv",
      rawArgs: ["node", "mangabaclaw", "status"],
      expected: ["node", "mangabaclaw", "status"],
    },
    {
      name: "keeps version-suffixed node binary",
      rawArgs: ["node-22", "mangabaclaw", "status"],
      expected: ["node-22", "mangabaclaw", "status"],
    },
    {
      name: "keeps windows versioned node exe",
      rawArgs: ["node-22.2.0.exe", "mangabaclaw", "status"],
      expected: ["node-22.2.0.exe", "mangabaclaw", "status"],
    },
    {
      name: "keeps dotted node binary",
      rawArgs: ["node-22.2", "mangabaclaw", "status"],
      expected: ["node-22.2", "mangabaclaw", "status"],
    },
    {
      name: "keeps dotted node exe",
      rawArgs: ["node-22.2.exe", "mangabaclaw", "status"],
      expected: ["node-22.2.exe", "mangabaclaw", "status"],
    },
    {
      name: "keeps absolute versioned node path",
      rawArgs: ["/usr/bin/node-22.2.0", "mangabaclaw", "status"],
      expected: ["/usr/bin/node-22.2.0", "mangabaclaw", "status"],
    },
    {
      name: "keeps node24 shorthand",
      rawArgs: ["node24", "mangabaclaw", "status"],
      expected: ["node24", "mangabaclaw", "status"],
    },
    {
      name: "keeps absolute node24 shorthand",
      rawArgs: ["/usr/bin/node24", "mangabaclaw", "status"],
      expected: ["/usr/bin/node24", "mangabaclaw", "status"],
    },
    {
      name: "keeps windows node24 exe",
      rawArgs: ["node24.exe", "mangabaclaw", "status"],
      expected: ["node24.exe", "mangabaclaw", "status"],
    },
    {
      name: "keeps nodejs binary",
      rawArgs: ["nodejs", "mangabaclaw", "status"],
      expected: ["nodejs", "mangabaclaw", "status"],
    },
    {
      name: "prefixes fallback when first arg is not a node launcher",
      rawArgs: ["node-dev", "mangabaclaw", "status"],
      expected: ["node", "mangabaclaw", "node-dev", "mangabaclaw", "status"],
    },
    {
      name: "prefixes fallback when raw args start at program name",
      rawArgs: ["mangabaclaw", "status"],
      expected: ["node", "mangabaclaw", "status"],
    },
    {
      name: "keeps bun execution argv",
      rawArgs: ["bun", "src/entry.ts", "status"],
      expected: ["bun", "src/entry.ts", "status"],
    },
  ] as const)("builds parse argv from raw args: $name", ({ rawArgs, expected }) => {
    const parsed = buildParseArgv([...rawArgs]);
    expect(parsed).toEqual([...expected]);
  });
});
