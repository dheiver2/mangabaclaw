// Command path policy tests cover allowed CLI command path shapes and lazy imports.
import { importFreshModule } from "mangabaclaw/plugin-sdk/test-fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliCommandCatalogEntry, CliCommandPathPolicy } from "./command-catalog.js";
import {
  resolveCliCommandPathPolicy,
  resolveCliNetworkProxyPolicy,
} from "./command-path-policy.js";

const DEFAULT_EXPECTED_POLICY: CliCommandPathPolicy = {
  configGuard: "run",
  loadPlugins: "never",
  pluginRegistry: { scope: "all" },
  ownsProtocolStdout: false,
  hideBanner: false,
  ensureCliPath: true,
  networkProxy: "default",
};

type NetworkProxyResolver = Extract<
  CliCommandPathPolicy["networkProxy"],
  (ctx: { argv: string[]; commandPath: string[] }) => unknown
>;
type LoadPluginsResolver = Extract<
  CliCommandPathPolicy["loadPlugins"],
  (ctx: { argv: string[]; commandPath: string[]; jsonOutputMode: boolean }) => unknown
>;
type ConfigGuardResolver = Extract<
  CliCommandPathPolicy["configGuard"],
  (ctx: { argv: string[]; commandPath: string[] }) => unknown
>;

function expectResolvedPolicy(
  commandPath: string[],
  expected: Partial<CliCommandPathPolicy>,
): void {
  expect(resolveCliCommandPathPolicy(commandPath)).toEqual({
    ...DEFAULT_EXPECTED_POLICY,
    ...expected,
  });
}

function expectNetworkProxyResolver(
  policy: CliCommandPathPolicy,
): asserts policy is CliCommandPathPolicy & { networkProxy: NetworkProxyResolver } {
  expect(typeof policy.networkProxy).toBe("function");
}

function expectLoadPluginsResolver(
  policy: CliCommandPathPolicy,
): asserts policy is CliCommandPathPolicy & { loadPlugins: LoadPluginsResolver } {
  expect(typeof policy.loadPlugins).toBe("function");
}

function expectConfigGuardResolver(
  policy: CliCommandPathPolicy,
): asserts policy is CliCommandPathPolicy & { configGuard: ConfigGuardResolver } {
  expect(typeof policy.configGuard).toBe("function");
}

describe("command-path-policy", () => {
  afterEach(() => {
    vi.doUnmock("./command-catalog.js");
    vi.resetModules();
  });

  it("resolves status policy with shared startup semantics", () => {
    expectResolvedPolicy(["status"], {
      configGuard: "skip",
      loadPlugins: "never",
      pluginRegistry: { scope: "channels" },
      ensureCliPath: false,
      networkProxy: "bypass",
    });
  });

  it("keeps built-in node RPCs off the config guard", () => {
    for (const subcommand of ["status", "list"]) {
      expectResolvedPolicy(["nodes", subcommand], {
        configGuard: "skip",
        networkProxy: "bypass",
      });
    }
    for (const subcommand of [
      "describe",
      "pending",
      "approve",
      "reject",
      "remove",
      "rename",
      "invoke",
      "notify",
      "push",
      "camera",
      "screen",
      "location",
    ]) {
      expectResolvedPolicy(["nodes", subcommand], {
        configGuard: "validate",
        networkProxy: "bypass",
      });
    }
    // Bare `mangabaclaw nodes` still resolves plugin subcommands from validated config.
    expectResolvedPolicy(["nodes"], { networkProxy: "bypass" });
    expectResolvedPolicy(["nodes", "pair"], { networkProxy: "bypass" });
  });

  it("keeps gateway-owned node and device mutations off the local config guard", () => {
    for (const subcommand of [
      "list",
      "join-code",
      "approve",
      "reject",
      "remove",
      "clear",
      "rename",
      "rotate",
      "revoke",
    ]) {
      const commandPath = ["devices", subcommand];
      expectResolvedPolicy(commandPath, {
        configGuard: "validate",
        networkProxy: "bypass",
      });
    }
  });

  it("keeps gateway control RPCs on core-only config validation", () => {
    for (const subcommand of ["call", "restart", "suspend", "resume"]) {
      expectResolvedPolicy(["gateway", subcommand], {
        configGuard: "validate",
        loadPlugins: "never",
        networkProxy: "bypass",
      });
    }
  });

  it("applies exact overrides after broader channel plugin rules", () => {
    expectResolvedPolicy(["channels", "send"], {
      loadPlugins: "always",
      pluginRegistry: { scope: "configured-channels" },
    });
    expectResolvedPolicy(["channels", "login"], {
      loadPlugins: "always",
      pluginRegistry: { scope: "configured-channels" },
    });
    expectResolvedPolicy(["channels", "capabilities"], {
      loadPlugins: "always",
      pluginRegistry: { scope: "configured-channels" },
    });
    expectResolvedPolicy(["channels", "add"], {
      loadPlugins: "never",
      pluginRegistry: { scope: "configured-channels" },
      networkProxy: "bypass",
    });
    const channelsStatusPolicy = resolveCliCommandPathPolicy(["channels", "status"]);
    expect(channelsStatusPolicy).toEqual({
      ...DEFAULT_EXPECTED_POLICY,
      configGuard: "skip",
      loadPlugins: "never",
      pluginRegistry: { scope: "configured-channels" },
      networkProxy: channelsStatusPolicy.networkProxy,
    });
    expectNetworkProxyResolver(channelsStatusPolicy);
    expect(
      channelsStatusPolicy.networkProxy({
        argv: ["node", "mangabaclaw", "channels", "status"],
        commandPath: ["channels", "status"],
      }),
    ).toBe("bypass");
    expect(
      channelsStatusPolicy.networkProxy({
        argv: ["node", "mangabaclaw", "channels", "status", "--probe"],
        commandPath: ["channels", "status"],
      }),
    ).toBe("default");
    expectResolvedPolicy(["channels", "list"], {
      configGuard: "skip",
      loadPlugins: "never",
      pluginRegistry: { scope: "configured-channels" },
      networkProxy: "bypass",
    });
    expectResolvedPolicy(["channels", "logs"], {
      loadPlugins: "never",
      pluginRegistry: { scope: "configured-channels" },
      networkProxy: "bypass",
    });
    expectResolvedPolicy(["channels", "remove"], {
      loadPlugins: "always",
      pluginRegistry: { scope: "configured-channels" },
      networkProxy: "bypass",
    });
    expectResolvedPolicy(["channels", "resolve"], {
      loadPlugins: "always",
      pluginRegistry: { scope: "configured-channels" },
      networkProxy: "bypass",
    });
  });

  it("keeps config-only agent commands on config-only startup", () => {
    const agentPolicy = resolveCliCommandPathPolicy(["agent"]);
    expect(agentPolicy).toEqual({
      ...DEFAULT_EXPECTED_POLICY,
      configGuard: agentPolicy.configGuard,
      loadPlugins: agentPolicy.loadPlugins,
      pluginRegistry: { scope: "all" },
      networkProxy: agentPolicy.networkProxy,
    });
    expectLoadPluginsResolver(agentPolicy);
    expectConfigGuardResolver(agentPolicy);
    expectNetworkProxyResolver(agentPolicy);
    expect(
      agentPolicy.loadPlugins({
        argv: ["node", "mangabaclaw", "agent"],
        commandPath: ["agent"],
        jsonOutputMode: false,
      }),
    ).toBe(false);
    expect(
      agentPolicy.loadPlugins({
        argv: ["node", "mangabaclaw", "agent", "--json"],
        commandPath: ["agent"],
        jsonOutputMode: true,
      }),
    ).toBe(false);
    expect(
      agentPolicy.loadPlugins({
        argv: ["node", "mangabaclaw", "agent", "--local"],
        commandPath: ["agent"],
        jsonOutputMode: true,
      }),
    ).toBe(true);
    expect(
      agentPolicy.configGuard({
        argv: ["node", "mangabaclaw", "agent"],
        commandPath: ["agent"],
      }),
    ).toBe("skip");
    expect(
      agentPolicy.configGuard({
        argv: ["node", "mangabaclaw", "agent", "--local"],
        commandPath: ["agent"],
      }),
    ).toBe("run");
    expect(
      agentPolicy.networkProxy({
        argv: ["node", "mangabaclaw", "agent"],
        commandPath: ["agent"],
      }),
    ).toBe("bypass");
    expect(
      agentPolicy.networkProxy({
        argv: ["node", "mangabaclaw", "agent", "--local"],
        commandPath: ["agent"],
      }),
    ).toBe("default");

    expectResolvedPolicy(["agent", "exec"], {
      configGuard: "skip",
      loadPlugins: "never",
      pluginRegistry: { scope: "all" },
      ownsProtocolStdout: true,
      hideBanner: true,
      networkProxy: "default",
    });

    for (const commandPath of [["agents"], ["agents", "list"]]) {
      expectResolvedPolicy(commandPath, {
        configGuard: "skip",
        loadPlugins: "never",
        networkProxy: "bypass",
      });
    }
    for (const commandPath of [
      ["agents", "bind"],
      ["agents", "unbind"],
      ["agents", "set-identity"],
      ["agents", "delete"],
    ]) {
      expectResolvedPolicy(commandPath, {
        loadPlugins: "never",
        networkProxy: "bypass",
      });
    }
    expectResolvedPolicy(["agents", "bindings"], {
      configGuard: "skip",
      loadPlugins: "never",
      networkProxy: "bypass",
    });
  });

  it.each([
    ["approvals", "pending"],
    ["skills"],
    ["skills", "list"],
    ["skills", "check"],
    ["gateway", "diagnostics", "export"],
    ["gateway", "stability"],
    ["gateway", "usage-cost"],
  ])("keeps read-only cold path %s out of startup config and plugins", (...commandPath) => {
    expectResolvedPolicy(commandPath, {
      configGuard: "skip",
      loadPlugins: "never",
      networkProxy: "bypass",
    });
  });

  it("resolves mixed startup-only rules", () => {
    expectResolvedPolicy(["qa", "suite"], {
      configGuard: "skip",
      loadPlugins: "never",
      networkProxy: "bypass",
    });
    expectResolvedPolicy(["worker"], {
      configGuard: "skip",
      loadPlugins: "never",
      hideBanner: true,
      ownsProtocolStdout: true,
      networkProxy: "bypass",
    });
    expectResolvedPolicy(["browser", "extension", "native-host"], {
      hideBanner: true,
      ownsProtocolStdout: true,
      networkProxy: "bypass",
    });
    expectResolvedPolicy(["configure"], {
      configGuard: "skip",
      loadPlugins: "never",
    });
    expectResolvedPolicy(["config"], {
      configGuard: "skip",
      loadPlugins: "never",
      networkProxy: "bypass",
    });
    expectResolvedPolicy(["config", "file"], {
      configGuard: "skip",
      ensureCliPath: false,
      loadPlugins: "never",
      ownsProtocolStdout: true,
      networkProxy: "bypass",
    });
    expectResolvedPolicy(["config", "set"], {
      loadPlugins: "never",
      networkProxy: "bypass",
    });
    const doctorPolicy = resolveCliCommandPathPolicy(["doctor"]);
    expectNetworkProxyResolver(doctorPolicy);
    expect(doctorPolicy).toMatchObject({
      configGuard: "skip",
      loadPlugins: "never",
    });
    expect(
      doctorPolicy.networkProxy({
        argv: ["node", "mangabaclaw", "doctor"],
        commandPath: ["doctor"],
      }),
    ).toBe("default");
    expect(
      doctorPolicy.networkProxy({
        argv: ["node", "mangabaclaw", "doctor", "--state-sqlite=compact"],
        commandPath: ["doctor"],
      }),
    ).toBe("bypass");
    expectResolvedPolicy(["config", "validate"], {
      configGuard: "skip",
      loadPlugins: "never",
      networkProxy: "bypass",
    });
    expectResolvedPolicy(["config", "schema"], {
      configGuard: "skip",
      loadPlugins: "never",
      ownsProtocolStdout: true,
      networkProxy: "bypass",
    });
    expectResolvedPolicy(["gateway", "status"], {
      configGuard: "skip",
      loadPlugins: "never",
      networkProxy: "bypass",
    });
    expectResolvedPolicy(["gateway", "health"], {
      configGuard: "skip",
      loadPlugins: "never",
      networkProxy: "bypass",
    });
    expectResolvedPolicy(["plugins", "update"], {
      loadPlugins: "never",
      hideBanner: true,
    });
    expectResolvedPolicy(["plugins", "list"], {
      configGuard: "skip",
      ensureCliPath: false,
      loadPlugins: "never",
      networkProxy: "bypass",
    });
    for (const commandPath of [["tasks"], ["tasks", "list"], ["tasks", "audit"]]) {
      expectResolvedPolicy(commandPath, {
        configGuard: "skip",
        ensureCliPath: false,
        loadPlugins: "never",
        networkProxy: "bypass",
      });
    }
    for (const commandPath of [
      ["plugins", "install"],
      ["plugins", "inspect"],
      ["plugins", "registry"],
      ["plugins", "doctor"],
    ]) {
      expectResolvedPolicy(commandPath, {
        loadPlugins: "never",
      });
    }
    expectResolvedPolicy(["cron", "list"], {
      configGuard: "skip",
      loadPlugins: "never",
      networkProxy: "bypass",
    });
    for (const commandPath of [
      ["hooks"],
      ["hooks", "list"],
      ["hooks", "info"],
      ["hooks", "check"],
      ["skills", "info"],
    ]) {
      expectResolvedPolicy(commandPath, {
        configGuard: "skip",
        loadPlugins: "never",
        networkProxy: "bypass",
      });
    }
    expectResolvedPolicy(["skills", "search"], {
      configGuard: "skip",
      loadPlugins: "never",
    });
    expectResolvedPolicy(["memory", "search"], {
      configGuard: "skip",
      loadPlugins: "always",
      pluginRegistry: { scope: "memory" },
    });
    const memoryStatusPolicy = resolveCliCommandPathPolicy(["memory", "status"]);
    expectConfigGuardResolver(memoryStatusPolicy);
    expect(memoryStatusPolicy.loadPlugins).toBe("always");
    expect(memoryStatusPolicy.pluginRegistry).toEqual({ scope: "memory" });
    expect(
      memoryStatusPolicy.configGuard({
        argv: ["node", "mangabaclaw", "memory", "status"],
        commandPath: ["memory", "status"],
      }),
    ).toBe("skip");
    for (const flag of ["--index", "--fix"]) {
      expect(
        memoryStatusPolicy.configGuard({
          argv: ["node", "mangabaclaw", "memory", "status", flag],
          commandPath: ["memory", "status"],
        }),
      ).toBe("run");
    }
  });

  it("keeps routed and Commander config reads ahead of observing startup guards", () => {
    expectResolvedPolicy(["config", "get"], {
      configGuard: "skip",
      ensureCliPath: false,
      loadPlugins: "never",
      networkProxy: "bypass",
    });
  });

  it("defaults unknown command paths to network proxy routing", () => {
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "googlemeet", "login"])).toBe(
      "default",
    );
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "tool", "image_generate"])).toBe(
      "bypass",
    );
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "tools", "effective"])).toBe("bypass");
  });

  it("resolves static network proxy bypass policies from the catalog", () => {
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "status"])).toBe("bypass");
    expect(
      resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "config", "get", "proxy.enabled"]),
    ).toBe("bypass");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "proxy", "start"])).toBe("bypass");
  });

  it("resolves mixed network proxy policies from argv-sensitive catalog entries", () => {
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "gateway"])).toBe("default");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "gateway", "run"])).toBe("default");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "gateway", "health"])).toBe("bypass");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "node", "run"])).toBe("default");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "node", "status"])).toBe("bypass");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "agent", "--local"])).toBe("default");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "agent", "run"])).toBe("bypass");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "channels", "status"])).toBe("bypass");
    expect(
      resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "channels", "status", "--probe"]),
    ).toBe("default");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "models", "status"])).toBe("bypass");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "models", "status", "--probe"])).toBe(
      "default",
    );
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "models", "--json"])).toBe("bypass");
    expect(
      resolveCliNetworkProxyPolicy([
        "node",
        "mangabaclaw",
        "models",
        "--agent",
        "main",
        "--status-json",
      ]),
    ).toBe("bypass");
    expect(
      resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "models", "--agent", "main", "auth"]),
    ).toBe("default");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "skills", "info", "browser"])).toBe(
      "bypass",
    );
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "skills", "check"])).toBe("bypass");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "skills", "list"])).toBe("bypass");
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "skills", "search", "browser"])).toBe(
      "default",
    );
  });

  it("routes ClawHub skill verification through the network proxy", () => {
    expect(
      resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "skills", "verify", "@demo-owner/weather"]),
    ).toBe("default");
  });

  it("uses the longest catalog command path for deep network proxy overrides", async () => {
    const catalog: readonly CliCommandCatalogEntry[] = [
      { commandPath: ["nodes"], policy: { networkProxy: "bypass" } },
      {
        commandPath: ["nodes", "camera", "snap"],
        exact: true,
        policy: { networkProxy: "default" },
      },
    ];

    vi.doMock("./command-catalog.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./command-catalog.js")>();
      return { ...actual, cliCommandCatalog: catalog };
    });
    const { resolveCliNetworkProxyPolicy: resolveCliNetworkProxyPolicyLocal } =
      await importFreshModule<typeof import("./command-path-policy.js")>(
        import.meta.url,
        "./command-path-policy.js?catalog-overrides",
      );

    expect(resolveCliNetworkProxyPolicyLocal(["node", "mangabaclaw", "nodes", "camera", "snap"])).toBe(
      "default",
    );
    expect(resolveCliNetworkProxyPolicyLocal(["node", "mangabaclaw", "nodes", "camera", "list"])).toBe(
      "bypass",
    );
  });

  it("stops catalog policy resolution before positional arguments", () => {
    expect(
      resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "config", "get", "proxy.enabled"]),
    ).toBe("bypass");
    expect(
      resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "message", "send", "--to", "demo"]),
    ).toBe("default");
  });

  it("treats bare gateway invocations with options as the gateway runtime", () => {
    const argv = ["node", "mangabaclaw", "gateway", "--port", "1234"];

    expect(resolveCliNetworkProxyPolicy(argv)).toBe("default");
  });

  it("resolves gateway runs after root options with values", () => {
    const argv = ["node", "mangabaclaw", "--log-level", "debug", "gateway", "run"];

    expect(resolveCliNetworkProxyPolicy(argv)).toBe("default");
  });

  it("does not let gateway run option values spoof bypass subcommands", () => {
    for (const argv of [
      ["node", "mangabaclaw", "gateway", "--token", "status"],
      ["node", "mangabaclaw", "gateway", "--token=status"],
      ["node", "mangabaclaw", "gateway", "--password", "health"],
      ["node", "mangabaclaw", "gateway", "--password-file", "status"],
      ["node", "mangabaclaw", "gateway", "--ws-log", "compact"],
    ]) {
      expect(resolveCliNetworkProxyPolicy(argv), argv.join(" ")).toBe("default");
    }
  });

  it("still resolves real gateway bypass subcommands after their command token", () => {
    expect(resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "gateway", "status"])).toBe("bypass");
    expect(
      resolveCliNetworkProxyPolicy(["node", "mangabaclaw", "gateway", "status", "--token", "secret"]),
    ).toBe("bypass");
  });
});
