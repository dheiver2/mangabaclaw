import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createExecTool } from "../agents/bash-tools.js";
import { resolveExecToolConfig } from "../agents/lazy-exec-tool.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { captureEnv } from "../test-utils/env.js";
import { withTempDir } from "../test-utils/temp-dir.js";
import { clearGatewayAgentCliShim, prepareGatewayAgentCliShim } from "./mangabaclaw-cli-shim.js";

const envSnapshot = captureEnv(["MANGABACLAW_EXEC_SHELL_SNAPSHOT", "MANGABACLAW_PROFILE", "PATH"]);

afterEach(() => {
  clearGatewayAgentCliShim();
  envSnapshot.restore();
});

function readExecText(result: Awaited<ReturnType<ReturnType<typeof createExecTool>["execute"]>>) {
  return result.content.find((entry) => entry.type === "text")?.text?.trim() ?? "";
}

describe.skipIf(process.platform === "win32")("Gateway agent CLI shim", () => {
  it.each([
    { profile: "work", expectedArgs: ["--profile", "work", "probe"] },
    { profile: undefined, expectedArgs: ["probe"] },
  ])("pins the running CLI before configured PATH entries (profile=$profile)", async (testCase) => {
    await withTempDir("mangabaclaw-agent-cli-shim-", async (root) => {
      const entryPath = path.join(root, "gateway-entry.mjs");
      const staleBinDir = path.join(root, "stale-bin");
      const staleCliPath = path.join(staleBinDir, "mangabaclaw");
      const stateDir = path.join(root, "state");
      await fs.mkdir(staleBinDir, { recursive: true });
      await fs.writeFile(
        entryPath,
        'console.log(JSON.stringify({ source: "gateway", args: process.argv.slice(2), pathHead: process.env.PATH?.split(":")[0] }));\n',
      );
      await fs.writeFile(staleCliPath, "#!/bin/sh\nprintf '%s\\n' '{\"source\":\"stale\"}'\n", {
        mode: 0o700,
      });

      await prepareGatewayAgentCliShim({
        env: testCase.profile ? { MANGABACLAW_PROFILE: testCase.profile } : {},
        invocation: { command: process.execPath, args: [entryPath], cwd: root },
        stateDir,
      });
      const shimBinDir = path.join(stateDir, "tmp", "agent-cli");
      const config = {
        tools: { exec: { pathPrepend: [staleBinDir] } },
      } satisfies MangabaClawConfig;
      const execConfig = resolveExecToolConfig({ cfg: config });
      expect(execConfig.pathPrepend?.slice(0, 2)).toEqual([shimBinDir, staleBinDir]);

      process.env.MANGABACLAW_EXEC_SHELL_SNAPSHOT = "0";
      process.env.PATH = `${staleBinDir}${path.delimiter}${process.env.PATH ?? ""}`;
      delete process.env.MANGABACLAW_PROFILE;
      const tool = createExecTool({
        ...execConfig,
        host: "gateway",
        security: "full",
        ask: "off",
        cwd: root,
        notifyOnExit: false,
      });
      const result = await tool.execute("gateway-cli-version-probe", {
        command: "mangabaclaw probe",
        yieldMs: 120_000,
      });
      expect(JSON.parse(readExecText(result))).toEqual({
        source: "gateway",
        args: testCase.expectedArgs,
        pathHead: shimBinDir,
      });
    });
  });
});

it("renders a Windows PATH launcher for the running CLI", async () => {
  await withTempDir("mangabaclaw-agent-cli-shim-win-", async (root) => {
    await prepareGatewayAgentCliShim({
      env: { MANGABACLAW_PROFILE: "work" },
      invocation: {
        command: "C:\\Program Files\\nodejs\\node.exe",
        args: ["C:\\MangabaClaw\\dist\\index.js"],
        cwd: "C:\\MangabaClaw",
      },
      platform: "win32",
      stateDir: root,
    });

    const executablePath = path.join(root, "tmp", "agent-cli", "mangabaclaw.cmd");
    expect(await fs.readFile(executablePath, "utf8")).toBe(
      '@echo off\r\n"C:\\Program Files\\nodejs\\node.exe" C:\\MangabaClaw\\dist\\index.js --profile work %*\r\n',
    );
  });
});
