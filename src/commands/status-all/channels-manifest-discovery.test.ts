// `status --all` must carry its prepared manifest records through missing-channel
// repair rows instead of rebuilding the manifest registry once per row.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";

const counters = vi.hoisted(() => ({
  manifestRegistryPreparations: 0,
}));

vi.mock("../../plugins/plugin-registry-contributions.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../plugins/plugin-registry-contributions.js")>();
  return {
    ...actual,
    loadPluginManifestRegistryForPluginRegistry: (
      ...args: Parameters<typeof actual.loadPluginManifestRegistryForPluginRegistry>
    ) => {
      counters.manifestRegistryPreparations += 1;
      return actual.loadPluginManifestRegistryForPluginRegistry(...args);
    },
  };
});

const { buildChannelsTable } = await import("./channels.js");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-status-all-discovery-"));
const OWNERLESS_CHANNEL_IDS = ["feishu", "googlechat", "matrix", "twitch"] as const;

function configFor(channelIds: readonly string[]): MangabaClawConfig {
  return {
    channels: Object.fromEntries(channelIds.map((channelId) => [channelId, { enabled: true }])),
  } as MangabaClawConfig;
}

async function runStatusChannels(channelIds: readonly string[]) {
  counters.manifestRegistryPreparations = 0;
  const table = await buildChannelsTable(configFor(channelIds));
  return {
    preparations: counters.manifestRegistryPreparations,
    table,
  };
}

beforeEach(() => {
  vi.stubEnv("MANGABACLAW_DISABLE_BUNDLED_PLUGINS", "1");
  vi.stubEnv("MANGABACLAW_DISABLE_UPDATE_CHECK", "1");
  vi.stubEnv("MANGABACLAW_HOME", path.join(tempRoot, "home"));
  vi.stubEnv("MANGABACLAW_STATE_DIR", path.join(tempRoot, "state"));
  vi.stubEnv("MANGABACLAW_CONFIG_PATH", path.join(tempRoot, "mangabaclaw.json"));
  vi.stubEnv("FEISHU_APP_ID", "");
  vi.stubEnv("FEISHU_APP_SECRET", "");
  vi.stubEnv("GOOGLE_CHAT_SERVICE_ACCOUNT", "");
  vi.stubEnv("GOOGLE_CHAT_SERVICE_ACCOUNT_FILE", "");
  vi.stubEnv("MATRIX_HOMESERVER", "");
  vi.stubEnv("MATRIX_ACCESS_TOKEN", "");
  vi.stubEnv("MANGABACLAW_TWITCH_ACCESS_TOKEN", "");
});

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it("keeps status-all manifest preparation constant as missing repair rows increase", async () => {
  await runStatusChannels([]);
  const one = await runStatusChannels(OWNERLESS_CHANNEL_IDS.slice(0, 1));
  const four = await runStatusChannels(OWNERLESS_CHANNEL_IDS);

  expect(four.table.rows.map((row) => row.id)).toEqual(
    expect.arrayContaining([...OWNERLESS_CHANNEL_IDS]),
  );
  expect({ oneRow: one.preparations, fourRows: four.preparations }).toStrictEqual({
    oneRow: 0,
    fourRows: 0,
  });
});
