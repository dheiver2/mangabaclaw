import fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { closeMangabaClawStateDatabaseForTest } from "../state/mangabaclaw-state-db.js";
import {
  createMangabaClawTestState,
  type MangabaClawTestState,
} from "../test-utils/mangabaclaw-test-state.js";
import { configureNodeHost } from "./config.js";
import { resolveLocalNodeId } from "./local-id.js";

const states: MangabaClawTestState[] = [];

afterEach(async () => {
  closeMangabaClawStateDatabaseForTest();
  while (states.length > 0) {
    await states.pop()?.cleanup();
  }
});

describe("resolveLocalNodeId", () => {
  it("reads and process-caches the canonical same-install node id", async () => {
    const state = await createMangabaClawTestState({
      label: "local-node-id",
      layout: "state-only",
    });
    states.push(state);
    await configureNodeHost({
      candidateNodeId: "gateway-local-node",
      fallbackDisplayName: "Gateway node",
      gateway: {},
      env: state.env,
      nowMs: 1,
    });

    await expect(resolveLocalNodeId(state.env)).resolves.toBe("gateway-local-node");

    await configureNodeHost({
      candidateNodeId: "replacement-node",
      fallbackDisplayName: "Replacement node",
      gateway: {},
      env: state.env,
      nowMs: 2,
    });
    await expect(resolveLocalNodeId(state.env)).resolves.toBe("gateway-local-node");
  });

  it("retries after a failed canonical config read", async () => {
    const state = await createMangabaClawTestState({
      label: "local-node-id-retry",
      layout: "state-only",
    });
    states.push(state);
    const legacyPath = state.statePath("node.json");
    await fs.writeFile(legacyPath, "{}\n", "utf8");

    await expect(resolveLocalNodeId(state.env)).rejects.toThrow("mangabaclaw doctor --fix");

    await fs.rm(legacyPath);
    await configureNodeHost({
      candidateNodeId: "recovered-local-node",
      fallbackDisplayName: "Recovered node",
      gateway: {},
      env: state.env,
      nowMs: 1,
    });
    await expect(resolveLocalNodeId(state.env)).resolves.toBe("recovered-local-node");
  });
});
