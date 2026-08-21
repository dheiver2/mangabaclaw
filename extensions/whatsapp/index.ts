// Whatsapp plugin entrypoint registers its MangabaClaw integration.
import {
  defineBundledChannelEntry,
  loadBundledEntryExportSync,
} from "mangabaclaw/plugin-sdk/channel-entry-contract";
import type { MangabaClawPluginApi } from "mangabaclaw/plugin-sdk/channel-entry-contract";

function registerWhatsAppCallTool(api: MangabaClawPluginApi): void {
  const registerTool = loadBundledEntryExportSync<(api: MangabaClawPluginApi) => void>(
    import.meta.url,
    {
      specifier: "./call-tool-api.js",
      exportName: "registerWhatsAppCallTool",
    },
  );
  registerTool(api);
}

export default defineBundledChannelEntry({
  id: "whatsapp",
  name: "WhatsApp",
  description: "WhatsApp channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "whatsappPlugin",
  },
  runtime: {
    specifier: "./runtime-setter-api.js",
    exportName: "setWhatsAppRuntime",
  },
  registerFull: registerWhatsAppCallTool,
});
