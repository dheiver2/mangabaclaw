// Start repair tests cover stale service repair install-plan wiring.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayService, GatewayServiceState } from "../../daemon/service.js";

const buildGatewayInstallPlanMock = vi.hoisted(() =>
  vi.fn(
    async (params: {
      existingEnvironment?: Record<string, string | undefined>;
      existingEnvironmentValueSources?: Record<
        string,
        "inline" | "file" | "inline-and-file" | undefined
      >;
    }) => {
      const preservedFileValue =
        params.existingEnvironmentValueSources?.TELEGRAM_DEFAULT_BOTTOKEN === "file";
      return {
        programArguments: ["/usr/bin/mangabaclaw", "gateway", "run"],
        workingDirectory: "/tmp/mangabaclaw",
        environment: {
          TELEGRAM_DEFAULT_BOTTOKEN: preservedFileValue
            ? params.existingEnvironment?.TELEGRAM_DEFAULT_BOTTOKEN
            : "placeholder-overwritten-token",
        },
        environmentValueSources: {
          TELEGRAM_DEFAULT_BOTTOKEN: preservedFileValue ? "file" : "inline",
        },
      };
    },
  ),
);
const resolveGatewayInstallTokenMock = vi.hoisted(() => vi.fn());
const readConfigFileSnapshotForWriteMock = vi.hoisted(() => vi.fn());
const resolveGatewayPortMock = vi.hoisted(() =>
  vi.fn(
    (config: { gateway?: { port?: number } } | undefined, env: NodeJS.ProcessEnv = process.env) => {
      const portMatch = env.MANGABACLAW_GATEWAY_PORT?.trim().match(/(?:^|:)(\d+)$/);
      return Number(portMatch?.[1]) || config?.gateway?.port || 18_789;
    },
  ),
);
const resolveStateDirMock = vi.hoisted(() =>
  vi.fn((env: NodeJS.ProcessEnv) => env.MANGABACLAW_STATE_DIR?.trim() || `${env.HOME}/.mangabaclaw`),
);
const resolveConfigPathCandidateMock = vi.hoisted(() =>
  vi.fn(
    (env: NodeJS.ProcessEnv) =>
      env.MANGABACLAW_CONFIG_PATH?.trim() ||
      `${env.MANGABACLAW_STATE_DIR?.trim() || `${env.HOME}/.mangabaclaw`}/mangabaclaw.json`,
  ),
);
const resolveMangabaClawWrapperPathMock = vi.hoisted(() => vi.fn());
const formatGatewayServiceStartRepairIssuesMock = vi.hoisted(() => vi.fn());
const defaultRuntimeLogMock = vi.hoisted(() => vi.fn());
const assertGatewayServiceMutationAllowedMock = vi.hoisted(() => vi.fn());

vi.mock("../../commands/daemon-install-helpers.js", () => ({
  buildGatewayInstallPlan: buildGatewayInstallPlanMock,
}));

vi.mock("../../commands/daemon-runtime.js", () => ({
  DEFAULT_GATEWAY_DAEMON_RUNTIME: "node",
}));

vi.mock("../../commands/gateway-install-token.js", () => ({
  resolveGatewayInstallToken: resolveGatewayInstallTokenMock,
}));

vi.mock("../../config/io.js", () => ({
  readConfigFileSnapshotForWrite: readConfigFileSnapshotForWriteMock,
}));

vi.mock("../../config/paths.js", () => ({
  resolveConfigPathCandidate: resolveConfigPathCandidateMock,
  resolveGatewayPort: resolveGatewayPortMock,
  resolveStateDir: resolveStateDirMock,
}));

vi.mock("../../daemon/program-args.js", () => ({
  MANGABACLAW_WRAPPER_ENV_KEY: "MANGABACLAW_WRAPPER",
  resolveMangabaClawWrapperPath: resolveMangabaClawWrapperPathMock,
}));

vi.mock("../../daemon/service.js", () => ({
  formatGatewayServiceStartRepairIssues: formatGatewayServiceStartRepairIssuesMock,
}));

vi.mock("../../infra/gateway-supervision.js", () => ({
  assertGatewayServiceMutationAllowed: assertGatewayServiceMutationAllowedMock,
}));

vi.mock("../../runtime.js", () => ({
  defaultRuntime: { log: defaultRuntimeLogMock },
}));

const { repairLoadedGatewayServiceForStart } = await import("./start-repair.js");

function readFirstInstallPlanArg(): Record<string, unknown> {
  const [firstArg] = buildGatewayInstallPlanMock.mock.calls[0] ?? [];
  if (!firstArg) {
    throw new Error("expected first install plan call");
  }
  return firstArg as Record<string, unknown>;
}

describe("repairLoadedGatewayServiceForStart", () => {
  beforeEach(() => {
    vi.stubEnv("HOME", "/home/mangabaclaw");
    vi.stubEnv("MANGABACLAW_CONFIG_PATH", "");
    vi.stubEnv("MANGABACLAW_GATEWAY_PORT", "");
    vi.stubEnv("MANGABACLAW_HOME", "");
    vi.stubEnv("MANGABACLAW_PROFILE", "");
    vi.stubEnv("MANGABACLAW_STATE_DIR", "");
    buildGatewayInstallPlanMock.mockClear();
    resolveGatewayInstallTokenMock.mockReset();
    readConfigFileSnapshotForWriteMock.mockReset();
    resolveGatewayPortMock.mockClear();
    resolveMangabaClawWrapperPathMock.mockReset();
    formatGatewayServiceStartRepairIssuesMock.mockReset();
    defaultRuntimeLogMock.mockClear();
    assertGatewayServiceMutationAllowedMock.mockReset();

    resolveGatewayInstallTokenMock.mockResolvedValue({
      tokenRefConfigured: false,
      warnings: [],
    });
    readConfigFileSnapshotForWriteMock.mockResolvedValue({
      snapshot: { exists: true, valid: true, sourceConfig: {}, config: {} },
      writeOptions: { expectedConfigPath: "/tmp/mangabaclaw.json" },
    });
    resolveMangabaClawWrapperPathMock.mockResolvedValue("/usr/bin/mangabaclaw");
    formatGatewayServiceStartRepairIssuesMock.mockReturnValue(
      "service port does not match current gateway config",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("drops legacy version metadata when repairing genuine service drift", async () => {
    const installMock = vi.fn(async () => {});
    const isLoadedMock = vi.fn(async () => true);
    const service = {
      install: installMock,
      isLoaded: isLoadedMock,
    } as unknown as GatewayService;
    const existingEnvironment = {
      HOME: "/home/mangabaclaw",
      MANGABACLAW_SERVICE_VERSION: "2026.4.24",
      TELEGRAM_DEFAULT_BOTTOKEN: "existing-env-file-token",
    };
    const existingEnvironmentValueSources = {
      MANGABACLAW_SERVICE_VERSION: "inline" as const,
      TELEGRAM_DEFAULT_BOTTOKEN: "file" as const,
    };
    const state: GatewayServiceState = {
      installed: true,
      loadState: { status: "loaded" },
      running: false,
      env: {},
      command: {
        programArguments: ["/usr/bin/mangabaclaw", "gateway", "run"],
        environment: existingEnvironment,
        environmentValueSources: existingEnvironmentValueSources,
      },
    };

    await repairLoadedGatewayServiceForStart({
      service,
      state,
      issues: [{ code: "port-mismatch", message: "old port" }],
      json: true,
      stdout: process.stdout,
    });

    const planArg = readFirstInstallPlanArg();
    expect(planArg.existingEnvironment).toBe(existingEnvironment);
    expect(planArg.existingEnvironmentValueSources).toBe(existingEnvironmentValueSources);
    expect(installMock).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: { TELEGRAM_DEFAULT_BOTTOKEN: "existing-env-file-token" },
        environmentValueSources: { TELEGRAM_DEFAULT_BOTTOKEN: "file" },
      }),
    );
  });

  it.each(["start", "restart"] as const)(
    "refuses %s repair when ambient state, config, and port target a different service",
    async (action) => {
      vi.stubEnv("MANGABACLAW_STATE_DIR", "/home/mangabaclaw/stress-state");
      vi.stubEnv("MANGABACLAW_CONFIG_PATH", "/home/mangabaclaw/stress-state/mangabaclaw.json");
      readConfigFileSnapshotForWriteMock.mockResolvedValue({
        snapshot: {
          exists: true,
          valid: true,
          sourceConfig: { gateway: { port: 18_999 } },
          config: { gateway: { port: 18_999 } },
        },
        writeOptions: { expectedConfigPath: "/home/mangabaclaw/stress-state/mangabaclaw.json" },
      });

      const originalUnit = [
        "ExecStart=/usr/bin/mangabaclaw gateway --port 18789",
        "EnvironmentFile=-/home/mangabaclaw/.mangabaclaw/gateway.systemd.env",
        "Environment=MANGABACLAW_SERVICE_MANAGED_ENV_KEYS=OPENAI_API_KEY,MANGABACLAW_GATEWAY_PASSWORD",
      ].join("\n");
      let unit = originalUnit;
      const installMock = vi.fn(async () => {
        unit = "rewritten";
      });
      const service = {
        install: installMock,
        isLoaded: vi.fn(async () => true),
      } as unknown as GatewayService;
      const state: GatewayServiceState = {
        installed: true,
        loadState: { status: "loaded" },
        running: false,
        env: {},
        command: {
          programArguments: ["/usr/bin/mangabaclaw", "gateway", "--port", "18789"],
          environment: {
            HOME: "/home/mangabaclaw",
            OPENAI_API_KEY: "file-backed-openai-key",
            MANGABACLAW_GATEWAY_PASSWORD: "file-backed-password",
            MANGABACLAW_GATEWAY_PORT: "18789",
            MANGABACLAW_SERVICE_MANAGED_ENV_KEYS: "OPENAI_API_KEY,MANGABACLAW_GATEWAY_PASSWORD",
          },
          environmentValueSources: {
            HOME: "inline",
            OPENAI_API_KEY: "file",
            MANGABACLAW_GATEWAY_PASSWORD: "file",
            MANGABACLAW_GATEWAY_PORT: "inline",
            MANGABACLAW_SERVICE_MANAGED_ENV_KEYS: "inline",
          },
        },
      };

      const repairParams = {
        service,
        state,
        issues: [{ code: "port-mismatch" as const, message: "old port" }],
        json: true,
        stdout: process.stdout,
      };
      const repair =
        action === "restart"
          ? repairLoadedGatewayServiceForStart({ ...repairParams, action })
          : repairLoadedGatewayServiceForStart(repairParams);
      await expect(repair).rejects.toThrow(
        [
          "Refusing to repair the managed Gateway service because the current invocation targets a different Gateway:",
          '- MANGABACLAW_STATE_DIR: installed="/home/mangabaclaw/.mangabaclaw", ambient="/home/mangabaclaw/stress-state"',
          '- MANGABACLAW_CONFIG_PATH: installed="/home/mangabaclaw/.mangabaclaw/mangabaclaw.json", ambient="/home/mangabaclaw/stress-state/mangabaclaw.json"',
          '- gateway.port: installed="18789", ambient="18999"',
          `Run \`mangabaclaw gateway ${action}\` with the installed state directory, config path, and port (or unset conflicting environment overrides). To retarget intentionally, run \`mangabaclaw gateway install --force\`.`,
        ].join("\n"),
      );

      expect(unit).toBe(originalUnit);
      expect(installMock).not.toHaveBeenCalled();
      expect(buildGatewayInstallPlanMock).not.toHaveBeenCalled();
      expect(resolveGatewayInstallTokenMock).not.toHaveBeenCalled();
    },
  );

  it("refuses a port-less stale service repair when ambient port overrides its config port", async () => {
    vi.stubEnv("MANGABACLAW_GATEWAY_PORT", "18999");
    readConfigFileSnapshotForWriteMock.mockResolvedValue({
      snapshot: {
        exists: true,
        valid: true,
        sourceConfig: { gateway: { port: 18_789 } },
        config: { gateway: { port: 18_789 } },
      },
      writeOptions: { expectedConfigPath: "/home/mangabaclaw/.mangabaclaw/mangabaclaw.json" },
    });
    const installMock = vi.fn(async () => {});
    const service = {
      install: installMock,
      isLoaded: vi.fn(async () => true),
    } as unknown as GatewayService;
    const state: GatewayServiceState = {
      installed: true,
      loadState: { status: "loaded" },
      running: false,
      env: {},
      command: {
        programArguments: ["/usr/bin/mangabaclaw", "gateway"],
        environment: { HOME: "/home/mangabaclaw" },
      },
    };

    await expect(
      repairLoadedGatewayServiceForStart({
        service,
        state,
        issues: [{ code: "port-mismatch", message: "old port" }],
        json: true,
        stdout: process.stdout,
      }),
    ).rejects.toThrow('- gateway.port: installed="18789", ambient="18999"');

    expect(installMock).not.toHaveBeenCalled();
    expect(buildGatewayInstallPlanMock).not.toHaveBeenCalled();
  });

  it("resolves installed host-and-port environment syntax before comparing repair targets", async () => {
    const installMock = vi.fn(async () => {});
    const service = {
      install: installMock,
      isLoaded: vi.fn(async () => true),
    } as unknown as GatewayService;
    const state: GatewayServiceState = {
      installed: true,
      loadState: { status: "loaded" },
      running: false,
      env: {},
      command: {
        programArguments: ["/usr/bin/mangabaclaw", "gateway"],
        environment: {
          HOME: "/home/mangabaclaw",
          MANGABACLAW_GATEWAY_PORT: "127.0.0.1:19000",
        },
      },
    };

    await expect(
      repairLoadedGatewayServiceForStart({
        service,
        state,
        issues: [{ code: "port-mismatch", message: "old port" }],
        json: true,
        stdout: process.stdout,
      }),
    ).rejects.toThrow('- gateway.port: installed="19000", ambient="18789"');

    expect(installMock).not.toHaveBeenCalled();
    expect(buildGatewayInstallPlanMock).not.toHaveBeenCalled();
  });

  it("refuses repair when a legacy service does not identify its installed state directory", async () => {
    vi.stubEnv("HOME", "/home/ambient-user");
    const installMock = vi.fn(async () => {});
    const service = {
      install: installMock,
      isLoaded: vi.fn(async () => true),
    } as unknown as GatewayService;
    const state: GatewayServiceState = {
      installed: true,
      loadState: { status: "loaded" },
      running: false,
      env: {},
      command: {
        programArguments: ["/usr/bin/mangabaclaw", "gateway", "--port", "18789"],
        environment: { MANGABACLAW_GATEWAY_PORT: "18789" },
      },
    };

    await expect(
      repairLoadedGatewayServiceForStart({
        service,
        state,
        issues: [{ code: "missing-program", message: "missing program" }],
        json: true,
        stdout: process.stdout,
      }),
    ).rejects.toThrow("installed state directory cannot be determined");

    expect(installMock).not.toHaveBeenCalled();
    expect(buildGatewayInstallPlanMock).not.toHaveBeenCalled();
  });
});
