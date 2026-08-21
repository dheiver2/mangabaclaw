// Verifies config path normalization and platform-specific behavior.
import path from "node:path";
import { withTempHome } from "mangabaclaw/plugin-sdk/test-env";
import { describe, expect, it } from "vitest";
import { normalizeConfigPaths } from "./normalize-paths.js";

describe("normalizeConfigPaths", () => {
  it("expands tilde for path-ish keys only", async () => {
    await withTempHome(async (home) => {
      const cfg = normalizeConfigPaths({
        tools: { exec: { pathPrepend: ["~/bin"] } },
        plugins: { load: { paths: ["~/plugins/a"] } },
        logging: { file: "~/.mangabaclaw/logs/mangabaclaw.log" },
        hooks: {
          path: "~/.mangabaclaw/hooks.json5",
          transformsDir: "~/hooks-xform",
        },
        channels: {
          telegram: {
            accounts: {
              personal: {
                tokenFile: "~/.mangabaclaw/telegram.token",
              },
            },
          },
          whatsapp: {
            accounts: {
              personal: {
                authDir: "~/.mangabaclaw/credentials/wa-personal",
              },
            },
          },
          imessage: {
            accounts: { personal: { dbPath: "~/Library/Messages/chat.db" } },
          },
        },
        agents: {
          defaults: { workspace: "~/ws-default" },
          list: [
            {
              id: "main",
              workspace: "~/ws-agent",
              agentDir: "~/.mangabaclaw/agents/main",
              identity: {
                name: "~not-a-path",
              },
              sandbox: { workspaceRoot: "~/sandbox-root" },
            },
          ],
        },
      });

      expect(cfg.plugins?.load?.paths?.[0]).toBe(path.join(home, "plugins", "a"));
      expect(cfg.logging?.file).toBe(path.join(home, ".mangabaclaw", "logs", "mangabaclaw.log"));
      expect(cfg.hooks?.path).toBe(path.join(home, ".mangabaclaw", "hooks.json5"));
      expect(cfg.hooks?.transformsDir).toBe(path.join(home, "hooks-xform"));
      expect(cfg.tools?.exec?.pathPrepend?.[0]).toBe(path.join(home, "bin"));
      expect(cfg.channels?.telegram?.accounts?.personal?.tokenFile).toBe(
        path.join(home, ".mangabaclaw", "telegram.token"),
      );
      expect(cfg.channels?.whatsapp?.accounts?.personal?.authDir).toBe(
        path.join(home, ".mangabaclaw", "credentials", "wa-personal"),
      );
      expect(cfg.channels?.imessage?.accounts?.personal?.dbPath).toBe(
        path.join(home, "Library", "Messages", "chat.db"),
      );
      expect(cfg.agents?.defaults?.workspace).toBe(path.join(home, "ws-default"));
      expect(cfg.agents?.list?.[0]?.workspace).toBe(path.join(home, "ws-agent"));
      expect(cfg.agents?.list?.[0]?.agentDir).toBe(path.join(home, ".mangabaclaw", "agents", "main"));
      expect(cfg.agents?.list?.[0]?.sandbox?.workspaceRoot).toBe(path.join(home, "sandbox-root"));

      // Non-path key => do not treat "~" as home expansion.
      expect(cfg.agents?.list?.[0]?.identity?.name).toBe("~not-a-path");
    });
  });
});
