import { fileURLToPath } from "node:url";
import { definePluginEntry } from "mangabaclaw/plugin-sdk/plugin-entry";
import { createCrabboxWorkerProvider, resolveMangabaClawRoot } from "./src/crabbox-worker-provider.js";

const workerWallpaperPath = fileURLToPath(
  new URL("./assets/mangabaclaw-worker-wallpaper.png", import.meta.url),
);

export default definePluginEntry({
  id: "crabbox",
  name: "Crabbox Worker Provider",
  description: "Cloud worker provider backed by the Crabbox CLI",
  register(api) {
    api.registerWorkerProvider(
      createCrabboxWorkerProvider({
        mangabaclawRoot: resolveMangabaClawRoot(api.rootDir),
        wallpaperPath: workerWallpaperPath,
        warn: (message) => api.logger.warn(message),
      }),
    );
  },
});
