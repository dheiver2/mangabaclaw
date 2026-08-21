// Telegram tests cover bot native commands.skills allowlist plugin behavior.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createEmptyPluginRegistry,
  withPluginRuntimeRegistryScope,
} from "mangabaclaw/plugin-sdk/channel-test-helpers";
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { listSkillCommandsForAgents as listActualSkillCommandsForAgents } from "mangabaclaw/plugin-sdk/skill-commands-runtime";
import { writeSkill } from "mangabaclaw/plugin-sdk/test-fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerTelegramNativeCommands } from "./bot-native-commands.js";
import {
  createNativeCommandTestParams,
  listSkillCommandsForAgents,
  resetNativeCommandMenuMocks,
} from "./bot-native-commands.menu-test-support.js";

const tempDirs: string[] = [];

async function makeWorkspace(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("registerTelegramNativeCommands skill allowlist integration", () => {
  afterEach(async () => {
    resetNativeCommandMenuMocks();
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("registers only allowlisted skills for the bound agent menu", async () => {
    const workspaceDir = await makeWorkspace("mangabaclaw-telegram-skills-");
    await writeSkill({
      dir: path.join(workspaceDir, "skills", "alpha-skill"),
      name: "alpha-skill",
      description: "Alpha skill",
    });
    await writeSkill({
      dir: path.join(workspaceDir, "skills", "beta-skill"),
      name: "beta-skill",
      description: "Beta skill",
    });

    const setMyCommands = vi.fn().mockResolvedValue(undefined);
    const cfg: MangabaClawConfig = {
      agents: {
        list: [
          { id: "alpha", workspace: workspaceDir, skills: ["alpha-skill"] },
          { id: "beta", workspace: workspaceDir, skills: ["beta-skill"] },
        ],
      },
      bindings: [
        {
          agentId: "alpha",
          match: { channel: "telegram", accountId: "bot-a" },
        },
      ],
    };
    listSkillCommandsForAgents.mockImplementation(
      ({ cfg: cfgLocal, agentIds }: { cfg: MangabaClawConfig; agentIds?: string[] }) =>
        listActualSkillCommandsForAgents({ cfg: cfgLocal, agentIds }),
    );

    withPluginRuntimeRegistryScope(createEmptyPluginRegistry(), () =>
      registerTelegramNativeCommands({
        ...createNativeCommandTestParams(cfg, {
          bot: {
            api: {
              setMyCommands,
              sendMessage: vi.fn().mockResolvedValue(undefined),
            },
            command: vi.fn(),
          } as unknown as Parameters<typeof registerTelegramNativeCommands>[0]["bot"],
          runtime: { log: vi.fn() } as unknown as Parameters<
            typeof registerTelegramNativeCommands
          >[0]["runtime"],
          accountId: "bot-a",
        }),
      }),
    );

    expect(setMyCommands).toHaveBeenCalledOnce();
    const registeredCommands = (setMyCommands.mock.calls[0]?.[0] ?? []) as Array<{
      command: string;
    }>;

    expect(registeredCommands.map((entry) => entry.command)).toContain("alpha_skill");
    expect(registeredCommands.map((entry) => entry.command)).not.toContain("beta_skill");
  });
});
