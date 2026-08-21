// Codex CLI metadata stays lightweight until the command runs.
import { definePluginEntry, type MangabaClawPluginApi } from "mangabaclaw/plugin-sdk/plugin-entry";

export function registerCodexCliMetadata(api: MangabaClawPluginApi): void {
  api.registerCli(
    async ({ program }) => {
      const { registerCodexSessionCli } = await import("./src/session-cli.js");
      registerCodexSessionCli(program);
    },
    {
      descriptors: [
        {
          name: "codex",
          description: "Inspect and branch from Codex sessions through the Gateway",
          hasSubcommands: true,
        },
      ],
    },
  );
}

export default definePluginEntry({
  id: "codex",
  name: "Codex",
  description: "Codex app-server harness and native session supervision.",
  register: registerCodexCliMetadata,
});
