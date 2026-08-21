// Open Prose plugin entrypoint registers its MangabaClaw integration.
import { definePluginEntry, type MangabaClawPluginApi } from "./runtime-api.js";

export default definePluginEntry({
  id: "open-prose",
  name: "OpenProse",
  description: "Plugin-shipped prose skills bundle",
  register(_api: MangabaClawPluginApi) {
    // OpenProse is delivered via plugin-shipped skills.
  },
});
