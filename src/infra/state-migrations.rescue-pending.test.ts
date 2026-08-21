import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import {
  detectLegacyRescuePending,
  discardLegacyRescuePending,
} from "./state-migrations.rescue-pending.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

function writeLegacyApproval(stateDir: string, owner: "crestodian" | "mangabaclaw"): string {
  const sourcePath = path.join(stateDir, owner, "rescue-pending", "approval.json");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "{}\n");
  return sourcePath;
}

describe("legacy rescue pending cleanup", () => {
  it("discards both retired stores only during explicit doctor migration", () => {
    const stateDir = tempDirs.make("mangabaclaw-rescue-migration-");
    const crestodianPath = writeLegacyApproval(stateDir, "crestodian");
    const mangabaclawPath = writeLegacyApproval(stateDir, "mangabaclaw");

    const runtimeDetection = detectLegacyRescuePending({ stateDir });
    expect(runtimeDetection.hasLegacy).toBe(false);
    expect(discardLegacyRescuePending({ detected: runtimeDetection, stateDir })).toEqual({
      changes: [],
      warnings: [],
    });
    expect(fs.existsSync(crestodianPath)).toBe(true);
    expect(fs.existsSync(mangabaclawPath)).toBe(true);

    const doctorDetection = detectLegacyRescuePending({
      stateDir,
      doctorOnlyStateMigrations: true,
    });
    expect(doctorDetection.hasLegacy).toBe(true);
    const result = discardLegacyRescuePending({ detected: doctorDetection, stateDir });

    expect(result.warnings).toEqual([]);
    expect(result.changes).toHaveLength(1);
    expect(fs.existsSync(crestodianPath)).toBe(false);
    expect(fs.existsSync(mangabaclawPath)).toBe(false);
    expect(detectLegacyRescuePending({ stateDir, doctorOnlyStateMigrations: true }).hasLegacy).toBe(
      false,
    );
  });

  it("recomputes fixed owner paths instead of trusting detection paths", () => {
    const stateDir = tempDirs.make("mangabaclaw-rescue-migration-");
    const mangabaclawPath = writeLegacyApproval(stateDir, "mangabaclaw");

    discardLegacyRescuePending({
      detected: { hasLegacy: true, sourcePaths: [path.join(stateDir, "untrusted")] },
      stateDir,
    });

    expect(fs.existsSync(mangabaclawPath)).toBe(false);
  });

  it("refuses to traverse a symlinked owner directory", () => {
    const stateDir = tempDirs.make("mangabaclaw-rescue-migration-");
    const externalDir = tempDirs.make("mangabaclaw-rescue-migration-");
    const externalApproval = writeLegacyApproval(externalDir, "mangabaclaw");
    fs.symlinkSync(path.join(externalDir, "mangabaclaw"), path.join(stateDir, "mangabaclaw"));

    const detected = detectLegacyRescuePending({ stateDir, doctorOnlyStateMigrations: true });
    const result = discardLegacyRescuePending({ detected, stateDir });

    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([
      expect.stringContaining("Refused to remove retired rescue approvals through unsafe path"),
    ]);
    expect(fs.existsSync(externalApproval)).toBe(true);
  });
});
