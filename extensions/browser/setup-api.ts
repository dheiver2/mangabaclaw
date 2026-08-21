import { listAgentIds, resolveAgentConfig } from "mangabaclaw/plugin-sdk/agent-scope-runtime";
/**
 * Browser setup entry. It auto-enables the Browser plugin when config or tool
 * policies reference browser control.
 */
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/plugin-entry";
import { definePluginEntry } from "mangabaclaw/plugin-sdk/plugin-entry";
import {
  isRecord,
  normalizeOptionalLowercaseString,
} from "mangabaclaw/plugin-sdk/string-coerce-runtime";

function listContainsBrowser(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some((entry) => normalizeOptionalLowercaseString(entry) === "browser")
  );
}

function toolPolicyReferencesBrowser(value: unknown): boolean {
  return (
    isRecord(value) && (listContainsBrowser(value.allow) || listContainsBrowser(value.alsoAllow))
  );
}

function hasBrowserToolReference(config: MangabaClawConfig): boolean {
  if (toolPolicyReferencesBrowser(config.tools)) {
    return true;
  }
  return listAgentIds(config).some((agentId) =>
    toolPolicyReferencesBrowser(resolveAgentConfig(config, agentId)?.tools),
  );
}

/** Setup entry that detects existing Browser configuration references. */
export default definePluginEntry({
  id: "browser",
  name: "Browser Setup",
  description: "Lightweight Browser setup hooks",
  register(api) {
    api.registerAutoEnableProbe(({ config }) => {
      if (
        config.browser?.enabled === false ||
        config.plugins?.entries?.browser?.enabled === false
      ) {
        return null;
      }
      if (Object.hasOwn(config, "browser")) {
        return "browser configured";
      }
      if (config.plugins?.entries && Object.hasOwn(config.plugins.entries, "browser")) {
        return "browser plugin configured";
      }
      if (hasBrowserToolReference(config)) {
        return "browser tool referenced";
      }
      return null;
    });
  },
});
