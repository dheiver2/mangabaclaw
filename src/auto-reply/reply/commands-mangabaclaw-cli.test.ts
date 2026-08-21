// Verifies chat-facing CLI snippets execute the MangabaClaw CLI even from harness-hosted gateways.
import { describe, expect, it } from "vitest";
import {
  buildCurrentMangabaClawCliArgv,
  buildCurrentMangabaClawCliCommand,
  buildCurrentMangabaClawCliExecEnv,
} from "./commands-mangabaclaw-cli.js";

describe("buildCurrentMangabaClawCliArgv", () => {
  it("delegates launch policy while keeping shell rendering local", () => {
    const args = ["sessions", "export-trajectory"];
    const argv = buildCurrentMangabaClawCliArgv(args);
    expect(argv.at(-2)).toBe("sessions");
    expect(argv.at(-1)).toBe("export-trajectory");
    expect(buildCurrentMangabaClawCliCommand(args)).toBe(argv.map((value) => `'${value}'`).join(" "));
  });

  it("clears inherited Vitest runner environment for CLI child processes", () => {
    expect(
      buildCurrentMangabaClawCliExecEnv({
        PATH: "/usr/bin",
        VITEST: "true",
        VITEST_POOL_ID: "pool",
        MANGABACLAW_VITEST_MAX_WORKERS: "1",
      }),
    ).toEqual({
      VITEST: "",
      VITEST_POOL_ID: "",
      MANGABACLAW_VITEST_MAX_WORKERS: "",
    });
  });
});
