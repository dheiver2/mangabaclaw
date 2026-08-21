import { expectDefined } from "@mangabaclaw/normalization-core";
import type {
  MangabaClawPluginCommandDefinition,
  PluginCommandContext,
} from "mangabaclaw/plugin-sdk/plugin-entry";
import { createTestPluginApi } from "mangabaclaw/plugin-sdk/plugin-test-api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveTelegramMiniAppUrls = vi.hoisted(() => vi.fn());
const launchTickets = {
  issue: vi.fn(() => "launch-ticket"),
  consume: vi.fn(() => false),
};

vi.mock("./url.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./url.js")>()),
  resolveTelegramMiniAppUrls,
}));

const { registerTelegramMiniAppCommand } = await import("./command.js");

function registerDashboardCommand(
  api: Parameters<typeof registerTelegramMiniAppCommand>[0],
): MangabaClawPluginCommandDefinition {
  const commands: MangabaClawPluginCommandDefinition[] = [];
  registerTelegramMiniAppCommand(
    {
      ...api,
      registerCommand: (command) => commands.push(command),
    },
    launchTickets,
  );
  return expectDefined(commands[0], "registered Telegram dashboard command");
}

function commandContext(overrides: Partial<PluginCommandContext>): PluginCommandContext {
  return {
    channel: "telegram",
    isAuthorizedSender: true,
    commandBody: "/dashboard",
    config: {},
    requestConversationBinding: async () => ({ status: "error", message: "unused" }),
    detachConversationBinding: async () => ({ removed: false }),
    getCurrentConversationBinding: async () => null,
    ...overrides,
  };
}

describe("registerTelegramMiniAppCommand", () => {
  beforeEach(() => {
    launchTickets.issue.mockClear();
  });

  it("returns a DM-only message for group invocations", async () => {
    const command = registerDashboardCommand(
      createTestPluginApi({
        config: {
          channels: {
            telegram: {
              accounts: {
                ops: { allowFrom: ["123"] },
              },
            },
          },
        },
      }),
    );

    await expect(
      command.handler(
        commandContext({
          from: "telegram:group:-100",
          sessionKey: "telegram:group:-100",
          senderIsOwner: true,
        }),
      ),
    ).resolves.toEqual({ text: "open this in a DM with the bot" });
    expect(resolveTelegramMiniAppUrls).not.toHaveBeenCalled();
    expect(launchTickets.issue).not.toHaveBeenCalled();
  });

  it("returns a web app button for owner DM invocations", async () => {
    resolveTelegramMiniAppUrls.mockResolvedValue({
      pageUrl: "https://host.tailnet.ts.net/__mangabaclaw_tg_miniapp/",
      controlUiUrl: "https://host.tailnet.ts.net/mangabaclaw",
      gatewayUrl: "wss://host.tailnet.ts.net",
    });
    const command = registerDashboardCommand(
      createTestPluginApi({
        config: {
          channels: {
            telegram: {
              accounts: {
                ops: { allowFrom: ["123"] },
              },
            },
          },
        },
      }),
    );

    const result = await command.handler(
      commandContext({
        from: "telegram:123",
        sessionKey: "telegram:direct:123",
        senderIsOwner: false,
        accountId: "ops",
      }),
    );

    expect(result.text).toBe("Open MangabaClaw dashboard.");
    expect(result.presentation?.blocks).toEqual([
      {
        type: "buttons",
        buttons: [
          {
            label: "Open dashboard",
            webApp: {
              url: "https://host.tailnet.ts.net/__mangabaclaw_tg_miniapp/?accountId=ops#launchTicket=launch-ticket",
            },
          },
        ],
      },
    ]);
    expect(launchTickets.issue).toHaveBeenCalledWith({ accountId: "ops", userId: "123" });
  });
});
