import path from "node:path";
import { describe, expect, it } from "vitest";
import { deleteTestEnvValue, setTestEnvValue } from "../test-utils/env.js";
import { disconnectGatewayClient, startGatewayWithClient } from "./test-helpers.e2e.js";
import { installGatewayTestHooks, withGatewayServer } from "./test-helpers.server.js";

const envBeforeSuite = {
  PATH: process.env.PATH,
  MANGABACLAW_GATEWAY_PORT: process.env.MANGABACLAW_GATEWAY_PORT,
  MANGABACLAW_PATH_BOOTSTRAPPED: process.env.MANGABACLAW_PATH_BOOTSTRAPPED,
};

installGatewayTestHooks();

describe("Gateway test environment lifecycle", () => {
  it("records the process-wide startup environment", async () => {
    await withGatewayServer(async ({ port }) => {
      expect(process.env.MANGABACLAW_GATEWAY_PORT).toBe(String(port));
      expect(process.env.MANGABACLAW_PATH_BOOTSTRAPPED).toBe("1");
    });
  });

  it("restores startup-owned environment before the next test", () => {
    expect({
      PATH: process.env.PATH,
      MANGABACLAW_GATEWAY_PORT: process.env.MANGABACLAW_GATEWAY_PORT,
      MANGABACLAW_PATH_BOOTSTRAPPED: process.env.MANGABACLAW_PATH_BOOTSTRAPPED,
    }).toEqual(envBeforeSuite);
  });

  it("restores startup-owned environment when a direct E2E server closes", async () => {
    const stateDir = process.env.MANGABACLAW_STATE_DIR;
    if (!stateDir) {
      throw new Error("MANGABACLAW_STATE_DIR is required");
    }
    setTestEnvValue("PATH", process.env.PATH ?? "");
    deleteTestEnvValue("MANGABACLAW_PATH_BOOTSTRAPPED");
    const envBeforeServer = {
      PATH: process.env.PATH,
      MANGABACLAW_GATEWAY_PORT: process.env.MANGABACLAW_GATEWAY_PORT,
      MANGABACLAW_PATH_BOOTSTRAPPED: process.env.MANGABACLAW_PATH_BOOTSTRAPPED,
    };
    const token = "test-gateway-token-1234567890";
    for (const attempt of ["first", "second"]) {
      const started = await startGatewayWithClient({
        cfg: { gateway: { auth: { mode: "token", token } } },
        configPath: path.join(stateDir, "mangabaclaw.json"),
        token,
      });

      try {
        expect(process.env.MANGABACLAW_GATEWAY_PORT).toBe(String(started.port));
        expect(process.env.MANGABACLAW_PATH_BOOTSTRAPPED).toBe("1");
      } finally {
        await disconnectGatewayClient(started.client).catch(() => undefined);
        await started.server.close({
          reason: `${attempt} direct E2E environment proof complete`,
        });
      }

      expect({
        PATH: process.env.PATH,
        MANGABACLAW_GATEWAY_PORT: process.env.MANGABACLAW_GATEWAY_PORT,
        MANGABACLAW_PATH_BOOTSTRAPPED: process.env.MANGABACLAW_PATH_BOOTSTRAPPED,
      }).toEqual(envBeforeServer);
    }
  });
});
