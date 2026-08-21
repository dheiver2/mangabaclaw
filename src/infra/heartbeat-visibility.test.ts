// Covers heartbeat visibility resolution across defaults and accounts.
import { describe, expect, it } from "vitest";
import type { MangabaClawConfig } from "../config/config.js";
import { resolveHeartbeatVisibility } from "./heartbeat-visibility.js";

describe("resolveHeartbeatVisibility", () => {
  function createChannelDefaultsHeartbeatConfig(heartbeatVisibility: {
    showOk?: boolean;
    showAlerts?: boolean;
    useIndicator?: boolean;
  }): MangabaClawConfig {
    return {
      channels: {
        defaults: {
          heartbeatVisibility,
        },
      },
    } as MangabaClawConfig;
  }

  function createTelegramAccountHeartbeatConfig(): MangabaClawConfig {
    return {
      channels: {
        telegram: {
          heartbeatVisibility: {
            showOk: true,
          },
          accounts: {
            primary: {
              heartbeatVisibility: {
                showOk: false,
              },
            },
          },
        },
      },
    } as MangabaClawConfig;
  }

  it("returns default values when no config is provided", () => {
    const cfg = {} as MangabaClawConfig;
    const result = resolveHeartbeatVisibility({ cfg, channel: "telegram" });

    expect(result).toEqual({
      showOk: false,
      showAlerts: true,
      useIndicator: true,
    });
  });

  it("uses channel defaults when provided", () => {
    const cfg = createChannelDefaultsHeartbeatConfig({
      showOk: true,
      showAlerts: false,
      useIndicator: false,
    });

    const result = resolveHeartbeatVisibility({ cfg, channel: "telegram" });

    expect(result).toEqual({
      showOk: true,
      showAlerts: false,
      useIndicator: false,
    });
  });

  it("per-channel config overrides channel defaults", () => {
    const cfg = {
      channels: {
        defaults: {
          heartbeatVisibility: {
            showOk: false,
            showAlerts: true,
            useIndicator: true,
          },
        },
        telegram: {
          heartbeatVisibility: {
            showOk: true,
          },
        },
      },
    } as MangabaClawConfig;

    const result = resolveHeartbeatVisibility({ cfg, channel: "telegram" });

    expect(result).toEqual({
      showOk: true,
      showAlerts: true,
      useIndicator: true,
    });
  });

  it("per-account config overrides per-channel config", () => {
    const cfg = {
      channels: {
        defaults: {
          heartbeatVisibility: {
            showOk: false,
            showAlerts: true,
            useIndicator: true,
          },
        },
        telegram: {
          heartbeatVisibility: {
            showOk: false,
            showAlerts: false,
          },
          accounts: {
            primary: {
              heartbeatVisibility: {
                showOk: true,
                showAlerts: true,
              },
            },
          },
        },
      },
    } as MangabaClawConfig;

    const result = resolveHeartbeatVisibility({
      cfg,
      channel: "telegram",
      accountId: "primary",
    });

    expect(result).toEqual({
      showOk: true,
      showAlerts: true,
      useIndicator: true,
    });
  });

  it("falls through to defaults when account has no heartbeat config", () => {
    const cfg = {
      channels: {
        defaults: {
          heartbeatVisibility: {
            showOk: false,
          },
        },
        telegram: {
          heartbeatVisibility: {
            showAlerts: false,
          },
          accounts: {
            primary: {},
          },
        },
      },
    } as MangabaClawConfig;

    const result = resolveHeartbeatVisibility({
      cfg,
      channel: "telegram",
      accountId: "primary",
    });

    expect(result).toEqual({
      showOk: false,
      showAlerts: false,
      useIndicator: true,
    });
  });

  it("handles missing accountId gracefully", () => {
    const cfg = createTelegramAccountHeartbeatConfig();
    const result = resolveHeartbeatVisibility({ cfg, channel: "telegram" });

    expect(result.showOk).toBe(true);
  });

  it("handles non-existent account gracefully", () => {
    const cfg = createTelegramAccountHeartbeatConfig();
    const result = resolveHeartbeatVisibility({
      cfg,
      channel: "telegram",
      accountId: "nonexistent",
    });

    expect(result.showOk).toBe(true);
  });

  it("works with whatsapp channel", () => {
    const cfg = {
      channels: {
        whatsapp: {
          heartbeatVisibility: {
            showOk: true,
            showAlerts: false,
          },
        },
      },
    } as MangabaClawConfig;

    const result = resolveHeartbeatVisibility({ cfg, channel: "whatsapp" });

    expect(result).toEqual({
      showOk: true,
      showAlerts: false,
      useIndicator: true,
    });
  });

  it("works with discord channel", () => {
    const cfg = {
      channels: {
        discord: {
          heartbeatVisibility: {
            useIndicator: false,
          },
        },
      },
    } as MangabaClawConfig;

    const result = resolveHeartbeatVisibility({ cfg, channel: "discord" });

    expect(result).toEqual({
      showOk: false,
      showAlerts: true,
      useIndicator: false,
    });
  });

  it("works with slack channel", () => {
    const cfg = {
      channels: {
        slack: {
          heartbeatVisibility: {
            showOk: true,
            showAlerts: true,
            useIndicator: true,
          },
        },
      },
    } as MangabaClawConfig;

    const result = resolveHeartbeatVisibility({ cfg, channel: "slack" });

    expect(result).toEqual({
      showOk: true,
      showAlerts: true,
      useIndicator: true,
    });
  });

  it("webchat uses channel defaults only (no per-channel config)", () => {
    const cfg = createChannelDefaultsHeartbeatConfig({
      showOk: true,
      showAlerts: false,
      useIndicator: false,
    });

    const result = resolveHeartbeatVisibility({ cfg, channel: "webchat" });

    expect(result).toEqual({
      showOk: true,
      showAlerts: false,
      useIndicator: false,
    });
  });

  it("webchat returns defaults when no channel defaults configured", () => {
    const cfg = {} as MangabaClawConfig;

    const result = resolveHeartbeatVisibility({ cfg, channel: "webchat" });

    expect(result).toEqual({
      showOk: false,
      showAlerts: true,
      useIndicator: true,
    });
  });

  it("webchat ignores accountId (only uses defaults)", () => {
    const cfg = {
      channels: {
        defaults: {
          heartbeatVisibility: {
            showOk: true,
          },
        },
      },
    } as MangabaClawConfig;

    const result = resolveHeartbeatVisibility({
      cfg,
      channel: "webchat",
      accountId: "some-account",
    });

    expect(result.showOk).toBe(true);
  });
});
