import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertLegacyReefKeysMigrated } from "./legacy-key-guard.js";

describe("Reef legacy key guard", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks identity generation while a legacy keys file awaits Doctor", async () => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-reef-keys-"));
    tempDirs.push(stateRoot);
    const legacyDir = path.join(stateRoot, ".mangabaclaw", "data", "reef");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "keys.json"), "{}");

    await expect(assertLegacyReefKeysMigrated(undefined, {}, stateRoot)).rejects.toThrow(
      "Legacy Reef identity keys must be imported",
    );
  });

  it("uses the configured legacy directory when one is present", async () => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-reef-keys-"));
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-reef-custom-"));
    tempDirs.push(stateRoot, legacyDir);
    fs.writeFileSync(path.join(legacyDir, "keys.json"), "{}");

    await expect(assertLegacyReefKeysMigrated(legacyDir)).rejects.toThrow(
      "Legacy Reef identity keys must be imported",
    );
  });

  it("blocks when the legacy keys path exists but is not a regular file", async () => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-reef-keys-"));
    tempDirs.push(stateRoot);
    fs.mkdirSync(path.join(stateRoot, ".mangabaclaw", "data", "reef", "keys.json"), {
      recursive: true,
    });

    await expect(assertLegacyReefKeysMigrated(undefined, {}, stateRoot)).rejects.toThrow(
      "Legacy Reef identity keys must be imported",
    );
  });

  it("allows a new identity when no legacy key file exists", async () => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-reef-keys-"));
    tempDirs.push(stateRoot);

    await expect(assertLegacyReefKeysMigrated(undefined, {}, stateRoot)).resolves.toBeUndefined();
  });

  it("ignores default-home keys for an isolated active state", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-reef-home-"));
    const isolatedStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-reef-isolated-"));
    tempDirs.push(homeDir, isolatedStateDir);
    const legacyDir = path.join(homeDir, ".mangabaclaw", "data", "reef");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "keys.json"), "{}");

    await expect(
      assertLegacyReefKeysMigrated(undefined, { MANGABACLAW_STATE_DIR: isolatedStateDir }, homeDir),
    ).resolves.toBeUndefined();
  });

  it("honors explicitly configured default-home keys for an isolated active state", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-reef-home-"));
    const isolatedStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-reef-isolated-"));
    tempDirs.push(homeDir, isolatedStateDir);
    const legacyDir = path.join(homeDir, ".mangabaclaw", "data", "reef");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "keys.json"), "{}");

    await expect(
      assertLegacyReefKeysMigrated(legacyDir, { MANGABACLAW_STATE_DIR: isolatedStateDir }, homeDir),
    ).rejects.toThrow("Legacy Reef identity keys must be imported");
  });
});
