import { describe, expect, it } from "vitest";
import {
  mangabaClawNpmPrepublishVerifyUsage,
  parseMangabaClawNpmPrepublishVerifyArgs,
  usesPreparedLocalDependencyInstall,
} from "../scripts/mangabaclaw-npm-prepublish-verify.ts";

describe("parseMangabaClawNpmPrepublishVerifyArgs", () => {
  it("supports help, optional versions, and package-manager separators", () => {
    expect(parseMangabaClawNpmPrepublishVerifyArgs(["--help"])).toEqual({
      dependencyTarballPaths: [],
      help: true,
      tarballPath: "",
    });
    expect(parseMangabaClawNpmPrepublishVerifyArgs(["mangabaclaw.tgz"])).toEqual({
      dependencyTarballPaths: [],
      help: false,
      tarballPath: "mangabaclaw.tgz",
    });
    expect(parseMangabaClawNpmPrepublishVerifyArgs(["--", "mangabaclaw.tgz", "2026.3.23"])).toEqual({
      dependencyTarballPaths: [],
      expectedVersion: "2026.3.23",
      help: false,
      tarballPath: "mangabaclaw.tgz",
    });
  });

  it("rejects missing, option-like, and extra arguments before installing", () => {
    expect(() => parseMangabaClawNpmPrepublishVerifyArgs([])).toThrow(
      mangabaClawNpmPrepublishVerifyUsage(),
    );
    expect(() => parseMangabaClawNpmPrepublishVerifyArgs(["--tag"])).toThrow(
      "Unknown mangabaclaw npm prepublish verifier option: --tag",
    );
    expect(() => parseMangabaClawNpmPrepublishVerifyArgs(["mangabaclaw.tgz", "--tag"])).toThrow(
      "Unknown mangabaclaw npm prepublish verifier option: --tag",
    );
    expect(
      parseMangabaClawNpmPrepublishVerifyArgs(["mangabaclaw.tgz", "2026.3.23", "llm-core.tgz", "ai.tgz"]),
    ).toEqual({
      dependencyTarballPaths: ["llm-core.tgz", "ai.tgz"],
      expectedVersion: "2026.3.23",
      help: false,
      tarballPath: "mangabaclaw.tgz",
    });
    expect(() =>
      parseMangabaClawNpmPrepublishVerifyArgs(["mangabaclaw.tgz", "2026.3.23", "--bad"]),
    ).toThrow("Invalid dependency tarball path: --bad");
  });
});

describe("usesPreparedLocalDependencyInstall", () => {
  it("uses the prepared local project only for the single AI tarball release path", () => {
    expect(usesPreparedLocalDependencyInstall(0)).toBe(false);
    expect(usesPreparedLocalDependencyInstall(1)).toBe(true);
    expect(usesPreparedLocalDependencyInstall(2)).toBe(false);
  });
});
