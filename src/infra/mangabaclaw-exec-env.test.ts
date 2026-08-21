// Tests MangabaClaw execution environment construction.
import { describe, expect, it } from "vitest";
import { deleteTestEnvValue, setTestEnvValue } from "../test-utils/env.js";
import {
  ensureMangabaClawExecMarkerOnProcess,
  markMangabaClawExecEnv,
  MANGABACLAW_CLI_ENV_VAR,
} from "./mangabaclaw-exec-env.js";

const MANGABACLAW_CLI_ENV_VALUE = "1";

describe("markMangabaClawExecEnv", () => {
  it("returns a cloned env object with the exec marker set", () => {
    const env = { PATH: "/usr/bin", MANGABACLAW_CLI: "0" };
    const marked = markMangabaClawExecEnv(env);

    expect(marked).toEqual({
      PATH: "/usr/bin",
      MANGABACLAW_CLI: MANGABACLAW_CLI_ENV_VALUE,
    });
    expect(marked).not.toBe(env);
    expect(env.MANGABACLAW_CLI).toBe("0");
  });
});

describe("ensureMangabaClawExecMarkerOnProcess", () => {
  it.each([
    {
      name: "mutates and returns the provided process env",
      env: { PATH: "/usr/bin" } as NodeJS.ProcessEnv,
    },
    {
      name: "overwrites an existing marker on the provided process env",
      env: { PATH: "/usr/bin", [MANGABACLAW_CLI_ENV_VAR]: "0" } as NodeJS.ProcessEnv,
    },
  ])("$name", ({ env }) => {
    expect(ensureMangabaClawExecMarkerOnProcess(env)).toBe(env);
    expect(env[MANGABACLAW_CLI_ENV_VAR]).toBe(MANGABACLAW_CLI_ENV_VALUE);
  });

  it("defaults to mutating process.env when no env object is provided", () => {
    const previous = process.env[MANGABACLAW_CLI_ENV_VAR];
    deleteTestEnvValue(MANGABACLAW_CLI_ENV_VAR);

    try {
      expect(ensureMangabaClawExecMarkerOnProcess()).toBe(process.env);
      expect(process.env[MANGABACLAW_CLI_ENV_VAR]).toBe(MANGABACLAW_CLI_ENV_VALUE);
    } finally {
      if (previous === undefined) {
        deleteTestEnvValue(MANGABACLAW_CLI_ENV_VAR);
      } else {
        setTestEnvValue(MANGABACLAW_CLI_ENV_VAR, previous);
      }
    }
  });
});
