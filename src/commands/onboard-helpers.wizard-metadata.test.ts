import { describe, expect, it } from "vitest";
import { tryResolveLegacyCompatibilityAgentId } from "../config/legacy.default-agent-owner.js";
import { migratePersistedImplicitMainRoster } from "../config/legacy.roster.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { applyWizardMetadata } from "./onboard-helpers.js";

describe("applyWizardMetadata", () => {
  it("preserves the migrated legacy owner across the config replacement", () => {
    const cfg = migratePersistedImplicitMainRoster({
      agents: {
        list: [{ id: "main", default: true }, { id: "ops" }],
      },
    }).config as MangabaClawConfig;
    expect(tryResolveLegacyCompatibilityAgentId(cfg)).toBe("main");

    const result = applyWizardMetadata(cfg, { command: "doctor", mode: "local" });

    expect(result).not.toBe(cfg);
    expect(tryResolveLegacyCompatibilityAgentId(result)).toBe("main");
  });
});
