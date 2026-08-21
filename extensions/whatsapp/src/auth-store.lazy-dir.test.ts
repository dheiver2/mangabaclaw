// Whatsapp tests cover auth store.lazy dir plugin behavior.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_ACCOUNT_ID } from "mangabaclaw/plugin-sdk/routing";
import { captureEnv } from "mangabaclaw/plugin-sdk/test-env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("WhatsApp auth dir profile resolution", () => {
  let envSnapshot: ReturnType<typeof captureEnv>;
  let tempStateDir: string | undefined;

  beforeEach(() => {
    envSnapshot = captureEnv(["MANGABACLAW_STATE_DIR", "MANGABACLAW_OAUTH_DIR"]);
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "mangabaclaw-wa-profile-"));
    delete process.env.MANGABACLAW_STATE_DIR;
    delete process.env.MANGABACLAW_OAUTH_DIR;
    vi.resetModules();
  });

  afterEach(() => {
    envSnapshot.restore();
    vi.resetModules();
    if (tempStateDir) {
      fs.rmSync(tempStateDir, { recursive: true, force: true });
      tempStateDir = undefined;
    }
  });

  it("resolves the default web auth dir from MANGABACLAW_STATE_DIR at call time", async () => {
    const authStore = await import("./auth-store.js");
    process.env.MANGABACLAW_STATE_DIR = tempStateDir;

    const expected = path.join(tempStateDir ?? "", "credentials", "whatsapp", DEFAULT_ACCOUNT_ID);
    expect(authStore.resolveDefaultWebAuthDir()).toBe(expected);
  });

  it("exports the legacy default auth dir as a primitive string", async () => {
    process.env.MANGABACLAW_STATE_DIR = tempStateDir;
    const authStore = await import("./auth-store.js");

    const expected = path.join(tempStateDir ?? "", "credentials", "whatsapp", DEFAULT_ACCOUNT_ID);
    expect(authStore.WA_WEB_AUTH_DIR).toBe(expected);
    expect(typeof authStore.WA_WEB_AUTH_DIR).toBe("string");
  });

  it("lists WhatsApp auth dirs under the active profile state dir", async () => {
    const accounts = await import("./accounts.js");
    process.env.MANGABACLAW_STATE_DIR = tempStateDir;

    const dirs = accounts.listWhatsAppAuthDirs({});
    expect(dirs).toContain(path.join(tempStateDir ?? "", "credentials"));
    expect(dirs).toContain(
      path.join(tempStateDir ?? "", "credentials", "whatsapp", DEFAULT_ACCOUNT_ID),
    );
  });
});
