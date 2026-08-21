// Elevenlabs API module exposes the plugin public contract.
import { definePluginEntry } from "mangabaclaw/plugin-sdk/plugin-entry";
import { migrateElevenLabsLegacyTalkConfig } from "./config-compat.js";

export default definePluginEntry({
  id: "elevenlabs",
  name: "ElevenLabs Setup",
  description: "Lightweight ElevenLabs setup hooks",
  register(api) {
    api.registerConfigMigration((config) => migrateElevenLabsLegacyTalkConfig(config));
  },
});
