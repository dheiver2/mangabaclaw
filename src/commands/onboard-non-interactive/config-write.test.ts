import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";

const writeWizardConfigFile = vi.hoisted(() => vi.fn());

vi.mock("../../wizard/setup.shared.js", () => ({ writeWizardConfigFile }));

import { commitNonInteractiveOnboardConfig } from "./config-write.js";

describe("commitNonInteractiveOnboardConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeWizardConfigFile.mockImplementation(async (config: MangabaClawConfig) => config);
  });

  it("keeps the verified config hash on the canonical writer", async () => {
    const nextConfig: MangabaClawConfig = {
      gateway: { port: 19_001 },
    };

    await expect(
      commitNonInteractiveOnboardConfig({
        nextConfig,
        baseHash: "verified-config-hash",
      }),
    ).resolves.toBe(nextConfig);

    expect(writeWizardConfigFile).toHaveBeenCalledWith(nextConfig, {
      allowConfigSizeDrop: false,
      baseHash: "verified-config-hash",
    });
  });

  it("permits config size reduction only for an explicitly requested reset", async () => {
    const nextConfig: MangabaClawConfig = {};

    await commitNonInteractiveOnboardConfig({
      nextConfig,
      reset: true,
    });

    expect(writeWizardConfigFile).toHaveBeenCalledWith(nextConfig, {
      allowConfigSizeDrop: true,
    });
  });
});
