// Hook policy tests cover allow/deny decisions from hook configuration.
import { describe, expect, it } from "vitest";
import type { MangabaClawConfig } from "../config/config.js";
import { resolveHookEnableState, resolveHookEntries } from "./policy.js";
import type { HookEntry, HookSource } from "./types.js";

function makeHookEntry(name: string, source: HookSource): HookEntry {
  return {
    hook: {
      name,
      description: `${name} description`,
      source,
      filePath: `/tmp/${source}/${name}/HOOK.md`,
      baseDir: `/tmp/${source}/${name}`,
      handlerPath: `/tmp/${source}/${name}/handler.js`,
    },
    frontmatter: {
      name,
    },
    metadata: {
      events: ["command:new"],
    },
    invocation: {
      enabled: true,
    },
  };
}

describe("hook policy", () => {
  describe("resolveHookEnableState", () => {
    it("keeps workspace hooks disabled by default", () => {
      const entry = makeHookEntry("workspace-hook", "mangabaclaw-workspace");
      expect(resolveHookEnableState({ entry })).toEqual({
        enabled: false,
        reason: "workspace hook (disabled by default)",
      });
    });

    it("allows workspace hooks when explicitly enabled", () => {
      const entry = makeHookEntry("workspace-hook", "mangabaclaw-workspace");
      const config: MangabaClawConfig = {
        hooks: {
          internal: {
            entries: {
              "workspace-hook": {
                enabled: true,
              },
            },
          },
        },
      };
      expect(resolveHookEnableState({ entry, config })).toEqual({ enabled: true });
    });

    it("keeps plugin hooks enabled without local hook toggles", () => {
      const entry = makeHookEntry("plugin-hook", "mangabaclaw-plugin");
      expect(resolveHookEnableState({ entry })).toEqual({ enabled: true });
    });
  });

  describe("resolveHookEntries", () => {
    it("lets managed hooks override bundled and plugin hooks", () => {
      const bundled = makeHookEntry("shared", "mangabaclaw-bundled");
      const plugin = makeHookEntry("shared", "mangabaclaw-plugin");
      const managed = makeHookEntry("shared", "mangabaclaw-managed");

      const resolved = resolveHookEntries([bundled, plugin, managed]);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.hook.source).toBe("mangabaclaw-managed");
    });

    it("prevents workspace hooks from overriding non-workspace hooks", () => {
      const managed = makeHookEntry("shared", "mangabaclaw-managed");
      const workspace = makeHookEntry("shared", "mangabaclaw-workspace");

      const resolved = resolveHookEntries([managed, workspace]);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.hook.source).toBe("mangabaclaw-managed");
    });

    it("keeps later workspace entries for the same source/name", () => {
      const first = makeHookEntry("shared", "mangabaclaw-workspace");
      const second = makeHookEntry("shared", "mangabaclaw-workspace");
      second.hook.handlerPath = "/tmp/mangabaclaw-workspace/shared/handler-2.js";

      const resolved = resolveHookEntries([first, second]);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.hook.handlerPath).toContain("handler-2");
    });
  });
});
