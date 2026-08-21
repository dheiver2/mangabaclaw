// Codex tests cover profiler flag plugin behavior.
import { describe, expect, it } from "vitest";
import { isCodexAppServerProfilerEnabled } from "./profiler-flag.js";

describe("isCodexAppServerProfilerEnabled", () => {
  it("is disabled by default", () => {
    expect(isCodexAppServerProfilerEnabled(undefined, {} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("matches global and Codex profiler flags", () => {
    expect(
      isCodexAppServerProfilerEnabled(
        { diagnostics: { flags: ["codex.profiler"] } },
        {} as NodeJS.ProcessEnv,
      ),
    ).toBe(true);
    expect(
      isCodexAppServerProfilerEnabled(undefined, {
        MANGABACLAW_DIAGNOSTICS: "profiler",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("uses the documented diagnostics env disable override", () => {
    expect(
      isCodexAppServerProfilerEnabled({ diagnostics: { flags: ["codex.profiler"] } }, {
        MANGABACLAW_DIAGNOSTICS: "0",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});
