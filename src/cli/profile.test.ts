// Profile CLI tests cover profile selection, persistence, and command wiring.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGatewayPort } from "../config/paths.js";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "mangabaclaw",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "mangabaclaw", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("leaves gateway --dev for subcommands after leading root options", () => {
    const res = parseCliProfileArgs([
      "node",
      "mangabaclaw",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "mangabaclaw",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "mangabaclaw", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "mangabaclaw", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "mangabaclaw", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "mangabaclaw", "status"]);
  });

  it("parses interleaved --profile after the command token", () => {
    const res = parseCliProfileArgs(["node", "mangabaclaw", "status", "--profile", "work", "--deep"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "mangabaclaw", "status", "--deep"]);
  });

  it("preserves Matrix QA --profile for the command parser", () => {
    const res = parseCliProfileArgs([
      "node",
      "mangabaclaw",
      "qa",
      "matrix",
      "--profile",
      "fast",
      "--fail-fast",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "mangabaclaw",
      "qa",
      "matrix",
      "--profile",
      "fast",
      "--fail-fast",
    ]);
  });

  it("preserves Matrix QA --profile after leading root options", () => {
    const res = parseCliProfileArgs([
      "node",
      "mangabaclaw",
      "--no-color",
      "qa",
      "matrix",
      "--profile=fast",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "mangabaclaw", "--no-color", "qa", "matrix", "--profile=fast"]);
  });

  it("parses qa run --profile smoke-ci as a root profile", () => {
    const res = parseCliProfileArgs([
      "node",
      "mangabaclaw",
      "qa",
      "run",
      "--profile",
      "smoke-ci",
      "--category",
      "agent-runtime.agent-turn-execution",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("smoke-ci");
    expect(res.argv).toEqual([
      "node",
      "mangabaclaw",
      "qa",
      "run",
      "--category",
      "agent-runtime.agent-turn-execution",
    ]);
  });

  it("parses qa run --profile=release self-check invocations as root profiles", () => {
    const res = parseCliProfileArgs([
      "node",
      "mangabaclaw",
      "qa",
      "run",
      "--profile=release",
      "--output",
      "qa-report.md",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("release");
    expect(res.argv).toEqual(["node", "mangabaclaw", "qa", "run", "--output", "qa-report.md"]);
  });

  it("preserves qa run --qa-profile for the command parser", () => {
    const res = parseCliProfileArgs([
      "node",
      "mangabaclaw",
      "qa",
      "run",
      "--qa-profile",
      "smoke-ci",
      "--surface",
      "agent-runtime",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "mangabaclaw",
      "qa",
      "run",
      "--qa-profile",
      "smoke-ci",
      "--surface",
      "agent-runtime",
    ]);
  });

  it("parses arbitrary qa run --profile values as root profiles", () => {
    const res = parseCliProfileArgs([
      "node",
      "mangabaclaw",
      "qa",
      "run",
      "--profile",
      "work",
      "--output",
      "qa-report.md",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "mangabaclaw", "qa", "run", "--output", "qa-report.md"]);
  });

  it("parses arbitrary qa run --profile= values as root profiles", () => {
    const res = parseCliProfileArgs([
      "node",
      "mangabaclaw",
      "qa",
      "run",
      "--profile=work",
      "--output",
      "qa-report.md",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "mangabaclaw", "qa", "run", "--output", "qa-report.md"]);
  });

  it("still parses root --profile before qa run", () => {
    const res = parseCliProfileArgs([
      "node",
      "mangabaclaw",
      "--profile",
      "work",
      "qa",
      "run",
      "--qa-profile",
      "smoke-ci",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "mangabaclaw", "qa", "run", "--qa-profile", "smoke-ci"]);
  });

  it("still parses root --profile before Matrix QA", () => {
    const res = parseCliProfileArgs([
      "node",
      "mangabaclaw",
      "--profile",
      "work",
      "qa",
      "matrix",
      "--fail-fast",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "mangabaclaw", "qa", "matrix", "--fail-fast"]);
  });

  it("parses interleaved --dev after the command token", () => {
    const res = parseCliProfileArgs(["node", "mangabaclaw", "status", "--dev"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "mangabaclaw", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "mangabaclaw", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it.each([
    ["--dev first", ["node", "mangabaclaw", "--dev", "--profile", "work", "status"]],
    ["--profile first", ["node", "mangabaclaw", "--profile", "work", "--dev", "status"]],
    ["interleaved after command", ["node", "mangabaclaw", "status", "--profile", "work", "--dev"]],
  ])("rejects combining --dev with --profile (%s)", (_name, argv) => {
    const res = parseCliProfileArgs(argv);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".mangabaclaw-dev");
    expect(env.MANGABACLAW_PROFILE).toBe("dev");
    expect(env.MANGABACLAW_STATE_DIR).toBe(expectedStateDir);
    expect(env.MANGABACLAW_CONFIG_PATH).toBe(path.join(expectedStateDir, "mangabaclaw.json"));
    expect(env.MANGABACLAW_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      MANGABACLAW_PROFILE: "prod",
      MANGABACLAW_STATE_DIR: "/custom",
      MANGABACLAW_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.MANGABACLAW_PROFILE).toBe("dev");
    expect(env.MANGABACLAW_STATE_DIR).toBe("/custom");
    expect(env.MANGABACLAW_GATEWAY_PORT).toBe("19099");
    expect(env.MANGABACLAW_CONFIG_PATH).toBe(path.join("/custom", "mangabaclaw.json"));
  });

  it.each([
    { name: "default service to named profile", inheritedProfile: undefined, selected: "work" },
    { name: "named service to different profile", inheritedProfile: "main", selected: "work" },
    { name: "named service to dev", inheritedProfile: "main", selected: "dev" },
  ])("replaces the complete service selector bundle: $name", ({ inheritedProfile, selected }) => {
    const inheritedStateDir = inheritedProfile
      ? `/home/peter/.mangabaclaw-${inheritedProfile}`
      : "/home/peter/.mangabaclaw";
    const env: Record<string, string | undefined> = {
      MANGABACLAW_PROFILE: inheritedProfile,
      MANGABACLAW_STATE_DIR: inheritedStateDir,
      MANGABACLAW_CONFIG_PATH: path.join(inheritedStateDir, "mangabaclaw.json"),
      MANGABACLAW_GATEWAY_PORT: "18789",
      MANGABACLAW_LAUNCHD_LABEL: inheritedProfile
        ? `ai.mangabaclaw.${inheritedProfile}`
        : "ai.mangabaclaw.gateway",
      MANGABACLAW_SYSTEMD_UNIT: inheritedProfile
        ? `mangabaclaw-gateway-${inheritedProfile}.service`
        : "mangabaclaw-gateway.service",
      MANGABACLAW_WINDOWS_TASK_NAME: inheritedProfile
        ? `MangabaClaw Gateway (${inheritedProfile})`
        : "MangabaClaw Gateway",
      MANGABACLAW_SERVICE_MARKER: "mangabaclaw",
      MANGABACLAW_SERVICE_KIND: "gateway",
    };

    applyCliProfileEnv({ profile: selected, env, homedir: () => "/home/peter" });

    expect(env.MANGABACLAW_PROFILE).toBe(selected);
    expect(env.MANGABACLAW_STATE_DIR).toBe(`/home/peter/.mangabaclaw-${selected}`);
    expect(env.MANGABACLAW_CONFIG_PATH).toBeUndefined();
    expect(env.MANGABACLAW_GATEWAY_PORT).toBe(selected === "dev" ? "19001" : undefined);
    expect(env.MANGABACLAW_LAUNCHD_LABEL).toBeUndefined();
    expect(env.MANGABACLAW_SYSTEMD_UNIT).toBeUndefined();
    expect(env.MANGABACLAW_WINDOWS_TASK_NAME).toBeUndefined();
  });

  it("lets selected config or profile derivation resolve the port after stale service removal", () => {
    const env: Record<string, string | undefined> = {
      MANGABACLAW_PROFILE: "main",
      MANGABACLAW_STATE_DIR: "/home/peter/.mangabaclaw-main",
      MANGABACLAW_CONFIG_PATH: "/home/peter/.mangabaclaw-main/mangabaclaw.json",
      MANGABACLAW_GATEWAY_PORT: "18789",
      MANGABACLAW_LAUNCHD_LABEL: "ai.mangabaclaw.main",
      MANGABACLAW_SYSTEMD_UNIT: "mangabaclaw-gateway-main.service",
      MANGABACLAW_WINDOWS_TASK_NAME: "MangabaClaw Gateway (main)",
      MANGABACLAW_SERVICE_MARKER: "mangabaclaw",
      MANGABACLAW_SERVICE_KIND: "gateway",
    };

    applyCliProfileEnv({ profile: "work", env, homedir: () => "/home/peter" });

    expect(resolveGatewayPort({ gateway: { port: 21999 } }, env)).toBe(21999);
    expect(resolveGatewayPort(undefined, env)).not.toBe(18789);
  });

  it("supports legacy gateway services without a service kind", () => {
    const env: Record<string, string | undefined> = {
      MANGABACLAW_PROFILE: "main",
      MANGABACLAW_STATE_DIR: "/home/peter/.mangabaclaw-main",
      MANGABACLAW_CONFIG_PATH: "/home/peter/.mangabaclaw-main/mangabaclaw.json",
      MANGABACLAW_GATEWAY_PORT: "18789",
      MANGABACLAW_SERVICE_MARKER: "mangabaclaw",
    };

    applyCliProfileEnv({ profile: "work", env, homedir: () => "/home/peter" });

    expect(env.MANGABACLAW_CONFIG_PATH).toBeUndefined();
    expect(env.MANGABACLAW_GATEWAY_PORT).toBeUndefined();
  });

  it("preserves node service selectors when selecting a CLI profile", () => {
    const env: Record<string, string | undefined> = {
      MANGABACLAW_PROFILE: "main",
      MANGABACLAW_STATE_DIR: "/home/peter/.mangabaclaw-main",
      MANGABACLAW_CONFIG_PATH: "/home/peter/.mangabaclaw-main/mangabaclaw.json",
      MANGABACLAW_GATEWAY_PORT: "19999",
      MANGABACLAW_LAUNCHD_LABEL: "ai.mangabaclaw.node",
      MANGABACLAW_SYSTEMD_UNIT: "mangabaclaw-node.service",
      MANGABACLAW_WINDOWS_TASK_NAME: "MangabaClaw Node",
      MANGABACLAW_SERVICE_MARKER: "mangabaclaw",
      MANGABACLAW_SERVICE_KIND: "node",
    };

    applyCliProfileEnv({ profile: "work", env, homedir: () => "/home/peter" });

    expect(env.MANGABACLAW_GATEWAY_PORT).toBe("19999");
    expect(env.MANGABACLAW_LAUNCHD_LABEL).toBe("ai.mangabaclaw.node");
    expect(env.MANGABACLAW_SYSTEMD_UNIT).toBe("mangabaclaw-node.service");
    expect(env.MANGABACLAW_WINDOWS_TASK_NAME).toBe("MangabaClaw Node");
  });

  it.each([
    {
      name: "the default profile without a profile marker",
      inheritedProfile: undefined,
      inheritedStateDir: "/home/peter/.mangabaclaw",
    },
    {
      name: "the explicitly marked default profile",
      inheritedProfile: "default",
      inheritedStateDir: "/home/peter/.mangabaclaw",
    },
    {
      name: "another named profile",
      inheritedProfile: "main",
      inheritedStateDir: "/home/peter/.mangabaclaw-main",
    },
    {
      name: "a home-relative default state directory",
      inheritedProfile: undefined,
      inheritedStateDir: "~/.mangabaclaw",
    },
  ])(
    "switches inherited canonical state from $name to the requested profile",
    ({ inheritedProfile, inheritedStateDir }) => {
      const env: Record<string, string | undefined> = {
        MANGABACLAW_PROFILE: inheritedProfile,
        MANGABACLAW_STATE_DIR: inheritedStateDir,
        MANGABACLAW_CONFIG_PATH: path.join(inheritedStateDir, "mangabaclaw.json"),
      };

      applyCliProfileEnv({ profile: "work", env, homedir: () => "/home/peter" });

      const expectedStateDir = path.join(path.resolve("/home/peter"), ".mangabaclaw-work");
      expect(env.MANGABACLAW_PROFILE).toBe("work");
      expect(env.MANGABACLAW_STATE_DIR).toBe(expectedStateDir);
      expect(env.MANGABACLAW_CONFIG_PATH).toBe(path.join(expectedStateDir, "mangabaclaw.json"));
    },
  );

  it("preserves an explicit config outside inherited canonical profile state", () => {
    const env: Record<string, string | undefined> = {
      MANGABACLAW_PROFILE: "main",
      MANGABACLAW_STATE_DIR: "/home/peter/.mangabaclaw-main",
      MANGABACLAW_CONFIG_PATH: "/srv/mangabaclaw/custom.json",
    };

    applyCliProfileEnv({ profile: "work", env, homedir: () => "/home/peter" });

    expect(env.MANGABACLAW_STATE_DIR).toBe("/home/peter/.mangabaclaw-work");
    expect(env.MANGABACLAW_CONFIG_PATH).toBe("/srv/mangabaclaw/custom.json");
  });

  it.each(["mangabaclaw-gateway-main", "mangabaclaw-gateway-main.service"])(
    "drops inherited canonical service identities when switching profiles (%s)",
    (systemdUnit) => {
      const env: Record<string, string | undefined> = {
        MANGABACLAW_PROFILE: "main",
        MANGABACLAW_STATE_DIR: "/home/peter/.mangabaclaw-main",
        MANGABACLAW_CONFIG_PATH: "/home/peter/.mangabaclaw-main/mangabaclaw.json",
        MANGABACLAW_LAUNCHD_LABEL: "ai.mangabaclaw.main",
        MANGABACLAW_SYSTEMD_UNIT: systemdUnit,
        MANGABACLAW_WINDOWS_TASK_NAME: "MangabaClaw Gateway (main)",
      };

      applyCliProfileEnv({ profile: "work", env, homedir: () => "/home/peter" });

      expect(env.MANGABACLAW_LAUNCHD_LABEL).toBeUndefined();
      expect(env.MANGABACLAW_SYSTEMD_UNIT).toBeUndefined();
      expect(env.MANGABACLAW_WINDOWS_TASK_NAME).toBeUndefined();
    },
  );

  it("preserves explicit custom service identities when switching profiles", () => {
    const env: Record<string, string | undefined> = {
      MANGABACLAW_PROFILE: "main",
      MANGABACLAW_LAUNCHD_LABEL: "com.example.gateway",
      MANGABACLAW_SYSTEMD_UNIT: "custom-gateway.service",
      MANGABACLAW_WINDOWS_TASK_NAME: "Custom Gateway",
    };

    applyCliProfileEnv({ profile: "work", env, homedir: () => "/home/peter" });

    expect(env.MANGABACLAW_LAUNCHD_LABEL).toBe("com.example.gateway");
    expect(env.MANGABACLAW_SYSTEMD_UNIT).toBe("custom-gateway.service");
    expect(env.MANGABACLAW_WINDOWS_TASK_NAME).toBe("Custom Gateway");
  });

  it.each([
    { inheritedProfile: "Main", selectedProfile: "main" },
    { inheritedProfile: "main", selectedProfile: "Main" },
  ])(
    "keeps case-distinct named profiles isolated ($inheritedProfile to $selectedProfile)",
    ({ inheritedProfile, selectedProfile }) => {
      const inheritedStateDir = `/home/peter/.mangabaclaw-${inheritedProfile}`;
      const env: Record<string, string | undefined> = {
        MANGABACLAW_PROFILE: inheritedProfile,
        MANGABACLAW_STATE_DIR: inheritedStateDir,
        MANGABACLAW_CONFIG_PATH: path.join(inheritedStateDir, "mangabaclaw.json"),
      };

      applyCliProfileEnv({ profile: selectedProfile, env, homedir: () => "/home/peter" });

      const expectedStateDir = `/home/peter/.mangabaclaw-${selectedProfile}`;
      expect(env.MANGABACLAW_PROFILE).toBe(selectedProfile);
      expect(env.MANGABACLAW_STATE_DIR).toBe(expectedStateDir);
      expect(env.MANGABACLAW_CONFIG_PATH).toBe(path.join(expectedStateDir, "mangabaclaw.json"));
    },
  );

  it("treats case variants of the default profile as the same canonical profile", () => {
    const stateDir = "/home/peter/.mangabaclaw";
    const env: Record<string, string | undefined> = {
      MANGABACLAW_PROFILE: "Default",
      MANGABACLAW_STATE_DIR: stateDir,
      MANGABACLAW_CONFIG_PATH: path.join(stateDir, "mangabaclaw.json"),
    };

    applyCliProfileEnv({ profile: "default", env, homedir: () => "/home/peter" });

    expect(env.MANGABACLAW_PROFILE).toBe("default");
    expect(env.MANGABACLAW_STATE_DIR).toBe(stateDir);
    expect(env.MANGABACLAW_CONFIG_PATH).toBe(path.join(stateDir, "mangabaclaw.json"));
  });

  it.each([
    {
      name: "the default profile",
      inheritedProfile: undefined,
      inheritedConfigPath: "/home/peter/.mangabaclaw/mangabaclaw.json",
    },
    {
      name: "another named profile",
      inheritedProfile: "main",
      inheritedConfigPath: "/home/peter/.mangabaclaw-main/mangabaclaw.json",
    },
    {
      name: "a home-relative named profile",
      inheritedProfile: "main",
      inheritedConfigPath: "~/.mangabaclaw-main/mangabaclaw.json",
    },
  ])(
    "switches an inherited $name config when the state directory is absent",
    ({ inheritedProfile, inheritedConfigPath }) => {
      const env: Record<string, string | undefined> = {
        MANGABACLAW_PROFILE: inheritedProfile,
        MANGABACLAW_CONFIG_PATH: inheritedConfigPath,
      };

      applyCliProfileEnv({ profile: "work", env, homedir: () => "/home/peter" });

      const expectedStateDir = "/home/peter/.mangabaclaw-work";
      expect(env.MANGABACLAW_PROFILE).toBe("work");
      expect(env.MANGABACLAW_STATE_DIR).toBe(expectedStateDir);
      expect(env.MANGABACLAW_CONFIG_PATH).toBe(path.join(expectedStateDir, "mangabaclaw.json"));
    },
  );

  it("uses MANGABACLAW_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      MANGABACLAW_HOME: "/srv/mangabaclaw-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/mangabaclaw-home");
    expect(env.MANGABACLAW_STATE_DIR).toBe(path.join(resolvedHome, ".mangabaclaw-work"));
    expect(env.MANGABACLAW_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".mangabaclaw-work", "mangabaclaw.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it.each([
    {
      name: "no profile is set",
      cmd: "mangabaclaw doctor --fix",
      env: {},
      expected: "mangabaclaw doctor --fix",
    },
    {
      name: "profile is default",
      cmd: "mangabaclaw doctor --fix",
      env: { MANGABACLAW_PROFILE: "default" },
      expected: "mangabaclaw doctor --fix",
    },
    {
      name: "profile is Default (case-insensitive)",
      cmd: "mangabaclaw doctor --fix",
      env: { MANGABACLAW_PROFILE: "Default" },
      expected: "mangabaclaw doctor --fix",
    },
    {
      name: "profile is invalid",
      cmd: "mangabaclaw doctor --fix",
      env: { MANGABACLAW_PROFILE: "bad profile" },
      expected: "mangabaclaw doctor --fix",
    },
    {
      name: "--profile is already present",
      cmd: "mangabaclaw --profile work doctor --fix",
      env: { MANGABACLAW_PROFILE: "work" },
      expected: "mangabaclaw --profile work doctor --fix",
    },
    {
      name: "--dev is already present",
      cmd: "mangabaclaw --dev doctor",
      env: { MANGABACLAW_PROFILE: "dev" },
      expected: "mangabaclaw --dev doctor",
    },
  ])("returns command unchanged when $name", ({ cmd, env, expected }) => {
    expect(formatCliCommand(cmd, env)).toBe(expected);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("mangabaclaw doctor --fix", { MANGABACLAW_PROFILE: "work" })).toBe(
      "mangabaclaw --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("mangabaclaw doctor --fix", { MANGABACLAW_PROFILE: "  jbmangabaclaw  " })).toBe(
      "mangabaclaw --profile jbmangabaclaw doctor --fix",
    );
  });

  it("handles command with no args after mangabaclaw", () => {
    expect(formatCliCommand("mangabaclaw", { MANGABACLAW_PROFILE: "test" })).toBe(
      "mangabaclaw --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm mangabaclaw doctor", { MANGABACLAW_PROFILE: "work" })).toBe(
      "pnpm mangabaclaw --profile work doctor",
    );
  });

  it("inserts --container when a container hint is set", () => {
    expect(
      formatCliCommand("mangabaclaw gateway status --deep", { MANGABACLAW_CONTAINER_HINT: "demo" }),
    ).toBe("mangabaclaw --container demo gateway status --deep");
  });

  it("ignores unsafe container hints", () => {
    expect(
      formatCliCommand("mangabaclaw gateway status --deep", {
        MANGABACLAW_CONTAINER_HINT: "demo; rm -rf /",
      }),
    ).toBe("mangabaclaw gateway status --deep");
  });

  it("preserves both --container and --profile hints", () => {
    expect(
      formatCliCommand("mangabaclaw doctor", {
        MANGABACLAW_CONTAINER_HINT: "demo",
        MANGABACLAW_PROFILE: "work",
      }),
    ).toBe("mangabaclaw --container demo doctor");
  });

  it("does not prepend --container for update commands", () => {
    expect(formatCliCommand("mangabaclaw update", { MANGABACLAW_CONTAINER_HINT: "demo" })).toBe(
      "mangabaclaw update",
    );
    expect(
      formatCliCommand("pnpm mangabaclaw update --channel beta", { MANGABACLAW_CONTAINER_HINT: "demo" }),
    ).toBe("pnpm mangabaclaw update --channel beta");
  });
});
