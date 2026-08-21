import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";

const resolvePreferredMangabaClawTmpDirMock = vi.hoisted(() => vi.fn());

vi.mock("./tmp-mangabaclaw-dir.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tmp-mangabaclaw-dir.js")>();
  return {
    ...actual,
    resolvePreferredMangabaClawTmpDir: resolvePreferredMangabaClawTmpDirMock,
  };
});

import { withInstallWorkspace } from "./install-source-utils.js";

describe("withInstallWorkspace private root", () => {
  const tempDirs = useAutoCleanupTempDirTracker(afterEach);

  it.runIf(process.platform !== "win32")(
    "preserves parent temp root permissions when using private MangabaClaw temp root",
    async () => {
      const mockParentRoot = tempDirs.make("mangabaclaw-chmod-test-");
      const mockMangabaClawDir = path.join(mockParentRoot, "mangabaclaw");

      await fs.mkdir(mockMangabaClawDir, { recursive: true });
      await fs.chmod(mockParentRoot, 0o1777);
      const canonicalMangabaClawDir = await fs.realpath(mockMangabaClawDir);

      resolvePreferredMangabaClawTmpDirMock.mockReturnValue(mockMangabaClawDir);

      let observedDir = "";
      const value = await withInstallWorkspace("mangabaclaw-test-", async (tmpDir) => {
        observedDir = tmpDir;
        expect(path.dirname(tmpDir)).toBe(canonicalMangabaClawDir);
        await fs.writeFile(path.join(tmpDir, "marker.txt"), "ok");
        return "done";
      });

      expect(value).toBe("done");

      await expect(
        fs.stat(observedDir).then(
          () => true,
          () => false,
        ),
      ).resolves.toBe(false);

      const privateRootStat = await fs.stat(mockMangabaClawDir);
      expect(privateRootStat.mode & 0o7777).toBe(0o700);

      const parentStat = await fs.stat(mockParentRoot);
      expect(parentStat.mode & 0o7777).toBe(0o1777);
    },
  );
});
