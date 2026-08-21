// Discord API module exposes the plugin public contract.
import type { MangabaClawPluginApi } from "mangabaclaw/plugin-sdk/channel-entry-contract";
import { discordVoiceTranscriptsSourceProvider } from "./src/voice/transcripts-source.js";

// Bundled entrypoints may not statically import ./src, so transcript provider
// registration is routed through this top-level facade like other Discord APIs.
export function registerDiscordTranscriptSourceProvider(api: MangabaClawPluginApi): void {
  api.registerTranscriptSourceProvider(discordVoiceTranscriptsSourceProvider);
}
