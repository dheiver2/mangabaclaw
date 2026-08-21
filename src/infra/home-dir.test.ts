// Tests MangabaClaw home directory resolution.
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  expandHomePrefix,
  resolveEffectiveHomeDir,
  resolveHomeRelativePath,
  resolveOsHomeDir,
  resolveOsHomeRelativePath,
  resolveRequiredHomeDir,
  resolveRequiredOsHomeDir,
  resolveUserPath,
} from "./home-dir.js";

describe("resolveEffectiveHomeDir", () => {
  it.each([
    {
      name: "prefers MANGABACLAW_HOME over HOME and USERPROFILE",
      env: {
        MANGABACLAW_HOME: " /srv/mangabaclaw-home ",
        HOME: "/home/other",
        USERPROFILE: "C:/Users/other",
      } as NodeJS.ProcessEnv,
      homedir: () => "/fallback",
      expected: "/srv/mangabaclaw-home",
    },
    {
      name: "falls back to HOME",
      env: { HOME: " /home/alice " } as NodeJS.ProcessEnv,
      expected: "/home/alice",
    },
    {
      name: "falls back to USERPROFILE when HOME is blank",
      env: {
        HOME: "   ",
        USERPROFILE: " C:/Users/alice ",
      } as NodeJS.ProcessEnv,
      expected: "C:/Users/alice",
    },
    {
      name: "falls back to homedir when env values are blank",
      env: {
        MANGABACLAW_HOME: " ",
        HOME: " ",
        USERPROFILE: "\t",
      } as NodeJS.ProcessEnv,
      homedir: () => " /fallback ",
      expected: "/fallback",
    },
    {
      name: "treats literal undefined env values as unset",
      env: {
        MANGABACLAW_HOME: "undefined",
        HOME: "undefined",
        USERPROFILE: "null",
      } as NodeJS.ProcessEnv,
      homedir: () => " /fallback ",
      expected: "/fallback",
    },
  ])("$name", ({ env, homedir, expected }) => {
    expect(resolveEffectiveHomeDir(env, homedir)).toBe(path.resolve(expected));
  });

  it.each([
    {
      name: "expands ~/ using HOME",
      env: {
        MANGABACLAW_HOME: "~/svc",
        HOME: "/home/alice",
      } as NodeJS.ProcessEnv,
      expected: "/home/alice/svc",
    },
    {
      name: "expands ~\\\\ using USERPROFILE",
      env: {
        MANGABACLAW_HOME: "~\\svc",
        HOME: " ",
        USERPROFILE: "C:/Users/alice",
      } as NodeJS.ProcessEnv,
      expected: "C:/Users/alice\\svc",
    },
  ])("$name", ({ env, expected }) => {
    expect(resolveEffectiveHomeDir(env)).toBe(path.resolve(expected));
  });

  it("derives home from PREFIX on Android/Termux when HOME is unset", () => {
    const env = {
      PREFIX: "/data/data/com.termux/files/usr",
      ANDROID_DATA: "/data",
    } as NodeJS.ProcessEnv;
    expect(resolveEffectiveHomeDir(env, () => "/home")).toBe(
      path.resolve("/data/data/com.termux/files/home"),
    );
  });

  it("prefers HOME over PREFIX-derived path on Termux", () => {
    const env = {
      HOME: "/data/data/com.termux/files/home",
      PREFIX: "/data/data/com.termux/files/usr",
      ANDROID_DATA: "/data",
    } as NodeJS.ProcessEnv;
    expect(resolveEffectiveHomeDir(env)).toBe(path.resolve("/data/data/com.termux/files/home"));
  });

  it("ignores PREFIX without com.termux to avoid false positives in generic chroots", () => {
    const env = {
      PREFIX: "/usr",
      ANDROID_DATA: "/data",
    } as NodeJS.ProcessEnv;
    expect(resolveEffectiveHomeDir(env, () => "/fallback")).toBe(path.resolve("/fallback"));
  });

  it("ignores PREFIX values that only mention com.termux outside the Termux app root", () => {
    const env = {
      PREFIX: "/tmp/com.termux/usr",
      ANDROID_DATA: "/data",
    } as NodeJS.ProcessEnv;
    expect(resolveEffectiveHomeDir(env, () => "/fallback")).toBe(path.resolve("/fallback"));
  });

  it("uses Termux PREFIX for tilde expansion when HOME is unset", () => {
    const env = {
      MANGABACLAW_HOME: "~/workspace",
      PREFIX: "/data/data/com.termux/files/usr",
      ANDROID_DATA: "/data",
    } as NodeJS.ProcessEnv;
    expect(
      resolveEffectiveHomeDir(env, () => {
        throw new Error("no homedir");
      }),
    ).toBe(path.resolve("/data/data/com.termux/files/home/workspace"));
  });

  it("expands MANGABACLAW_HOME when set to ~", () => {
    const env = {
      MANGABACLAW_HOME: "~/svc",
      HOME: "/home/alice",
    } as NodeJS.ProcessEnv;

    expect(resolveEffectiveHomeDir(env)).toBe(path.resolve("/home/alice/svc"));
  });
});

describe("resolveRequiredHomeDir", () => {
  it.each([
    {
      name: "returns cwd when no home source is available",
      env: {} as NodeJS.ProcessEnv,
      homedir: () => {
        throw new Error("no home");
      },
      expected: process.cwd(),
    },
    {
      name: "returns a fully resolved path for MANGABACLAW_HOME",
      env: { MANGABACLAW_HOME: "/custom/home" } as NodeJS.ProcessEnv,
      homedir: () => "/fallback",
      expected: path.resolve("/custom/home"),
    },
    {
      name: "returns cwd when MANGABACLAW_HOME is tilde-only and no fallback home exists",
      env: { MANGABACLAW_HOME: "~" } as NodeJS.ProcessEnv,
      homedir: () => {
        throw new Error("no home");
      },
      expected: process.cwd(),
    },
  ])("$name", ({ env, homedir, expected }) => {
    expect(resolveRequiredHomeDir(env, homedir)).toBe(expected);
  });

  it("fails clearly when both home and cwd are unavailable", () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockImplementation(() => {
      throw new Error("ENOENT: uv_cwd");
    });
    const noHome = () => {
      throw new Error("no home");
    };

    try {
      expect(() => resolveRequiredHomeDir({}, noHome)).toThrow(/set MANGABACLAW_HOME/i);
      expect(() => resolveRequiredOsHomeDir({}, noHome)).toThrow(/set HOME/i);
    } finally {
      cwdSpy.mockRestore();
    }
  });
});

describe("resolveOsHomeDir", () => {
  it("ignores MANGABACLAW_HOME and uses HOME", () => {
    expect(
      resolveOsHomeDir(
        {
          MANGABACLAW_HOME: "/srv/mangabaclaw-home",
          HOME: "/home/alice",
          USERPROFILE: "C:/Users/alice",
        } as NodeJS.ProcessEnv,
        () => "/fallback",
      ),
    ).toBe(path.resolve("/home/alice"));
  });
});

describe("expandHomePrefix", () => {
  it.each([
    {
      name: "expands ~/ using effective home",
      input: "~/x",
      opts: {
        env: { MANGABACLAW_HOME: "/srv/mangabaclaw-home" } as NodeJS.ProcessEnv,
      },
      expected: `${path.resolve("/srv/mangabaclaw-home")}/x`,
    },
    {
      name: "expands exact ~ using explicit home",
      input: "~",
      opts: { home: " /srv/mangabaclaw-home " },
      expected: "/srv/mangabaclaw-home",
    },
    {
      name: "expands ~\\\\ using resolved env home",
      input: "~\\x",
      opts: {
        env: { HOME: "/home/alice" } as NodeJS.ProcessEnv,
      },
      expected: `${path.resolve("/home/alice")}\\x`,
    },
    {
      name: "keeps non-tilde values unchanged",
      input: "/tmp/x",
      expected: "/tmp/x",
    },
  ])("$name", ({ input, opts, expected }) => {
    expect(expandHomePrefix(input, opts)).toBe(expected);
  });
});

describe("resolveHomeRelativePath", () => {
  it.each([
    {
      name: "returns blank input unchanged",
      input: "   ",
      expected: "",
    },
    {
      name: "resolves trimmed relative paths",
      input: " ./tmp/file.txt ",
      expected: path.resolve("./tmp/file.txt"),
    },
    {
      name: "resolves trimmed absolute paths",
      input: " /tmp/file.txt ",
      expected: path.resolve("/tmp/file.txt"),
    },
    {
      name: "expands tilde paths using the resolved home directory",
      input: "~/docs",
      opts: {
        env: { MANGABACLAW_HOME: "/srv/mangabaclaw-home" } as NodeJS.ProcessEnv,
      },
      expected: path.resolve("/srv/mangabaclaw-home/docs"),
    },
    {
      name: "falls back to cwd when tilde paths have no home source",
      input: "~",
      opts: {
        env: {} as NodeJS.ProcessEnv,
        homedir: () => {
          throw new Error("no home");
        },
      },
      expected: path.resolve(process.cwd()),
    },
  ])("$name", ({ input, opts, expected }) => {
    expect(resolveHomeRelativePath(input, opts)).toBe(expected);
  });
});

describe("resolveUserPath", () => {
  it("preserves the historical falsy-input contract", () => {
    expect(resolveUserPath(undefined as unknown as string)).toBe("");
    expect(resolveUserPath(null as unknown as string)).toBe("");
  });
});

describe("resolveOsHomeRelativePath", () => {
  it("expands tilde paths using the OS home instead of MANGABACLAW_HOME", () => {
    expect(
      resolveOsHomeRelativePath("~/docs", {
        env: {
          MANGABACLAW_HOME: "/srv/mangabaclaw-home",
          HOME: "/home/alice",
        } as NodeJS.ProcessEnv,
      }),
    ).toBe(path.resolve("/home/alice/docs"));
  });
});
