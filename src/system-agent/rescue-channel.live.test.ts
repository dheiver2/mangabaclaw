// MangabaClaw live rescue channel tests cover live-channel rescue message delivery.
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../auto-reply/reply/commands-types.js";
import { clearConfigCache } from "../config/config.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { isTruthyEnvValue } from "../infra/env.js";
import { resetPluginStateStoreForTests } from "../plugin-state/plugin-state-store.js";
import { withTestDir } from "../test-helpers/temp-dir.js";
import { deleteTestEnvValue, setTestEnvValue } from "../test-utils/env.js";
import { listSystemAgentAuditEntriesForTests } from "./audit.test-support.js";
import { runSystemAgentRescueMessage } from "./rescue-message.js";

const originalStateDir = process.env.MANGABACLAW_STATE_DIR;
const originalConfigPath = process.env.MANGABACLAW_CONFIG_PATH;

const runLive =
  isTruthyEnvValue(process.env.MANGABACLAW_LIVE_TEST) &&
  isTruthyEnvValue(process.env.MANGABACLAW_LIVE_SYSTEM_AGENT_RESCUE_CHANNEL);
const describeLive = runLive ? describe : describe.skip;

function commandContext(channel = process.env.MANGABACLAW_LIVE_SYSTEM_AGENT_CHANNEL ?? "whatsapp") {
  return {
    surface: channel,
    channel,
    channelId: channel,
    ownerList: ["user:owner"],
    senderIsOwner: true,
    isAuthorizedSender: true,
    senderId: "user:owner",
    rawBodyNormalized: "/mangabaclaw status",
    commandBodyNormalized: "/mangabaclaw status",
    from: "user:owner",
    to: "account:default",
  } satisfies CommandContext;
}

async function runRescue(params: {
  commandBody: string;
  cfg: MangabaClawConfig;
  ctx?: CommandContext;
}) {
  const ctx = params.ctx ?? commandContext();
  return await runSystemAgentRescueMessage({
    cfg: params.cfg,
    command: { ...ctx, commandBodyNormalized: params.commandBody },
    commandBody: params.commandBody,
    isGroup: false,
  });
}

describeLive("MangabaClaw live rescue channel smoke", () => {
  afterEach(() => {
    resetPluginStateStoreForTests();
    clearConfigCache();
    if (originalStateDir === undefined) {
      deleteTestEnvValue("MANGABACLAW_STATE_DIR");
    } else {
      setTestEnvValue("MANGABACLAW_STATE_DIR", originalStateDir);
    }
    if (originalConfigPath === undefined) {
      deleteTestEnvValue("MANGABACLAW_CONFIG_PATH");
    } else {
      setTestEnvValue("MANGABACLAW_CONFIG_PATH", originalConfigPath);
    }
  });

  it("handles /mangabaclaw status and a persistent approval roundtrip", async () => {
    await withTestDir({ prefix: "mangabaclaw-live-rescue-" }, async (tempDir) => {
      const configPath = path.join(tempDir, "mangabaclaw.json");
      setTestEnvValue("MANGABACLAW_STATE_DIR", tempDir);
      setTestEnvValue("MANGABACLAW_CONFIG_PATH", configPath);
      await fs.writeFile(
        configPath,
        JSON.stringify(
          {
            meta: { lastTouchedVersion: "live-test", lastTouchedAt: new Date(0).toISOString() },
            agents: { defaults: {} },
            tools: { exec: { mode: "full" } },
          },
          null,
          2,
        ),
      );

      const cfg: MangabaClawConfig = {
        tools: { exec: { mode: "full" } },
      };

      await expect(runRescue({ commandBody: "/mangabaclaw status", cfg })).resolves.toContain(
        "[mangabaclaw] done: status.check",
      );
      await expect(
        runRescue({ commandBody: "/mangabaclaw set default model openai/gpt-5.5", cfg }),
      ).resolves.toContain("Reply /mangabaclaw yes to apply");
      await expect(runRescue({ commandBody: "/mangabaclaw yes", cfg })).resolves.toContain(
        "Default model: openai/gpt-5.5",
      );

      const config = JSON.parse(await fs.readFile(configPath, "utf8")) as MangabaClawConfig;
      const defaultModel = config.agents?.defaults?.model;
      if (!defaultModel || typeof defaultModel !== "object") {
        throw new Error("expected default model object");
      }
      expect(defaultModel.primary).toBe("openai/gpt-5.5");
      expect(
        listSystemAgentAuditEntriesForTests().some(
          (entry) => entry.value.operation === "config.setDefaultModel",
        ),
      ).toBe(true);
    });
  });
});
