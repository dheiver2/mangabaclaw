// Legacy OAuth sidecar tests cover doctor repair and warnings for old OAuth sidecar state.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLogger, setLoggerOverride } from "../../../logging/logger.js";
import { loggingState } from "../../../logging/state.js";
import {
  createMangabaClawTestState,
  type MangabaClawTestState,
} from "../../../test-utils/mangabaclaw-test-state.js";
import { loadLegacyOAuthSidecarMaterial } from "./legacy-oauth-sidecar.js";

const states: MangabaClawTestState[] = [];

function setPlatform(value: NodeJS.Platform): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value, configurable: true });
  return () => {
    if (descriptor) {
      Object.defineProperty(process, "platform", descriptor);
    }
  };
}

async function writeLegacySidecarThatNeedsKeychain(): Promise<{
  state: MangabaClawTestState;
  ref: { source: "mangabaclaw-credentials"; provider: "openai-codex"; id: string };
  profileId: string;
}> {
  const state = await createMangabaClawTestState({
    layout: "state-only",
    prefix: "mangabaclaw-legacy-oauth-keychain-warn-",
    env: {
      MANGABACLAW_AGENT_DIR: undefined,
      MANGABACLAW_AUTH_PROFILE_SECRET_KEY: undefined,
    },
  });
  states.push(state);
  const profileId = "openai-codex:default";
  const ref = {
    source: "mangabaclaw-credentials" as const,
    provider: "openai-codex" as const,
    id: "0123456789abcdef0123456789abcdef",
  };
  await state.writeJson(`credentials/auth-profiles/${ref.id}.json`, {
    version: 1,
    profileId,
    provider: "openai-codex",
    encrypted: {
      algorithm: "aes-256-gcm",
      iv: "AQIDBAUGBwgJCgsM",
      tag: "G1t3MG1wjsZq17LOSqvu8w",
      ciphertext: "nkPkvPO-ZilcU9XIoVzMfskmxKVmknxIjFkNw3yLMhiP3d5--KdbiMub",
    },
  });
  return { state, ref, profileId };
}

afterEach(async () => {
  for (const state of states.splice(0)) {
    await state.cleanup();
  }
});

describe("loadLegacyOAuthSidecarMaterial keychain-only headless warning", () => {
  let restorePlatform: () => void;
  let warnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    restorePlatform = setPlatform("darwin");
    setLoggerOverride({ level: "warn", consoleLevel: "warn" });
    warnSpy = vi.fn();
    loggingState.rawConsole = {
      log: vi.fn(),
      info: vi.fn(),
      warn: warnSpy as unknown as typeof console.warn,
      error: vi.fn(),
    };
  });

  afterEach(() => {
    restorePlatform();
    loggingState.rawConsole = null;
    setLoggerOverride(null);
    resetLogger();
  });

  function envWithoutVitestSignals(state: MangabaClawTestState): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...state.env };
    delete env.VITEST;
    delete env.VITEST_WORKER_ID;
    return env;
  }

  it("emits one doctor-pointer warning only on Darwin", async () => {
    const { state, ref, profileId } = await writeLegacySidecarThatNeedsKeychain();
    const env = envWithoutVitestSignals(state);
    const load = () =>
      loadLegacyOAuthSidecarMaterial({
        ref,
        profileId,
        provider: "openai-codex",
        allowKeychainPrompt: false,
        env,
      });

    restorePlatform();
    restorePlatform = setPlatform("linux");
    expect(load()).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();

    restorePlatform();
    restorePlatform = setPlatform("darwin");
    expect(load()).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [firstMessage] = warnSpy.mock.calls[0] as [unknown];
    expect(String(firstMessage)).toContain("mangabaclaw doctor --fix");
    expect(String(firstMessage)).toContain("macOS Keychain");

    expect(load()).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
