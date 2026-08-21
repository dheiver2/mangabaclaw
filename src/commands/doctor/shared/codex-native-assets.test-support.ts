import type { MangabaClawConfig } from "../../../config/types.mangabaclaw.js";
import "./codex-native-assets.js";

type CodexNativeAssetHit = {
  kind: "skill" | "plugin" | "config" | "hooks";
  path: string;
};

type TestApi = {
  scanCodexNativeAssets(params: {
    cfg: MangabaClawConfig;
    env?: NodeJS.ProcessEnv;
  }): Promise<CodexNativeAssetHit[]>;
};

function getTestApi(): TestApi {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("mangabaclaw.codexNativeAssetsTestApi")
  ] as TestApi;
}

export const scanCodexNativeAssets: TestApi["scanCodexNativeAssets"] = (params) =>
  getTestApi().scanCodexNativeAssets(params);
