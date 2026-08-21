// Logger browser import tests cover safe import behavior in browser-like runtimes.
import { importFreshModule } from "mangabaclaw/plugin-sdk/test-fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";

type LoggerModule = typeof import("./logger.js");

const originalGetBuiltinModule = (
  process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }
).getBuiltinModule;

async function importBrowserSafeLogger(params?: {
  resolvePreferredMangabaClawTmpDir?: ReturnType<typeof vi.fn>;
}): Promise<{
  module: LoggerModule;
  resolvePreferredMangabaClawTmpDir: ReturnType<typeof vi.fn>;
}> {
  const resolvePreferredMangabaClawTmpDir =
    params?.resolvePreferredMangabaClawTmpDir ??
    vi.fn(() => {
      throw new Error("resolvePreferredMangabaClawTmpDir should not run during browser-safe import");
    });

  vi.doMock("../infra/tmp-mangabaclaw-dir.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/tmp-mangabaclaw-dir.js")>(
      "../infra/tmp-mangabaclaw-dir.js",
    );
    return {
      ...actual,
      resolvePreferredMangabaClawTmpDir,
    };
  });

  Object.defineProperty(process, "getBuiltinModule", {
    configurable: true,
    value: undefined,
  });

  const module = await importFreshModule<LoggerModule>(
    import.meta.url,
    "./logger.js?scope=browser-safe",
  );
  return { module, resolvePreferredMangabaClawTmpDir };
}

describe("logging/logger browser-safe import", () => {
  afterEach(() => {
    vi.doUnmock("../infra/tmp-mangabaclaw-dir.js");
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: originalGetBuiltinModule,
    });
  });

  it("does not resolve the preferred temp dir at import time when node fs is unavailable", async () => {
    const { module, resolvePreferredMangabaClawTmpDir } = await importBrowserSafeLogger();

    expect(resolvePreferredMangabaClawTmpDir).not.toHaveBeenCalled();
    expect(module.DEFAULT_LOG_DIR).toBe("/tmp/mangabaclaw");
    expect(module.DEFAULT_LOG_FILE).toBe("/tmp/mangabaclaw/mangabaclaw.log");
  });

  it("disables file logging when imported in a browser-like environment", async () => {
    const { module, resolvePreferredMangabaClawTmpDir } = await importBrowserSafeLogger();

    expect(module.getResolvedLoggerSettings()).toStrictEqual({
      level: "silent",
      file: "/tmp/mangabaclaw/mangabaclaw.log",
      maxFileBytes: 100 * 1024 * 1024,
    });
    expect(module.isFileLogLevelEnabled("info")).toBe(false);
    expect(module.getLogger().info("browser-safe")).toBeUndefined();
    expect(resolvePreferredMangabaClawTmpDir).not.toHaveBeenCalled();
  });
});
