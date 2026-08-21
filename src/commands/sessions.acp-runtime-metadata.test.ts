// Sessions ACP runtime metadata tests cover session-owned runtime overlays.
import { describe, expect, it } from "vitest";
import {
  resolveCurrentSessionAgentRuntimeMetadata,
  resolveModelAgentRuntimeMetadata,
} from "../agents/agent-runtime-metadata.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { parseAgentSessionKey } from "../routing/session-key.js";

const ACP_SESSION_KEY = "agent:copilot:acp:86b7b5af-3773-4a56-b244-069d6c5d3db9";
const NON_ACP_SESSION_KEY = "agent:main:main";

function buildConfigWithoutAgentRuntimePolicy(): MangabaClawConfig {
  return {
    agents: {
      list: [{ id: "copilot" }, { id: "main", default: true }],
      defaults: {},
    },
  } as MangabaClawConfig;
}

function computeSessionAgentRuntime(params: {
  cfg: MangabaClawConfig;
  sessionKey: string;
  fallbackAgentId: string;
  acpRuntime?: boolean;
  acpBackend?: string;
}): ReturnType<typeof resolveModelAgentRuntimeMetadata> {
  const agentId = parseAgentSessionKey(params.sessionKey)?.agentId ?? params.fallbackAgentId;
  return resolveModelAgentRuntimeMetadata({
    cfg: params.cfg,
    agentId,
    sessionKey: params.sessionKey,
    acpRuntime: params.acpRuntime,
    acpBackend: params.acpBackend,
  });
}

describe("session ACP runtime metadata", () => {
  it("prefers an explicit ACP backend", () => {
    const agentRuntime = computeSessionAgentRuntime({
      cfg: buildConfigWithoutAgentRuntimePolicy(),
      sessionKey: ACP_SESSION_KEY,
      fallbackAgentId: "copilot",
      acpRuntime: true,
      acpBackend: "custom-backend",
    });

    expect(agentRuntime).toEqual({ id: "custom-backend", source: "session-key" });
  });

  it("falls back to acpx when ACP metadata has no backend", () => {
    const agentRuntime = computeSessionAgentRuntime({
      cfg: buildConfigWithoutAgentRuntimePolicy(),
      sessionKey: ACP_SESSION_KEY,
      fallbackAgentId: "copilot",
      acpRuntime: true,
    });

    expect(agentRuntime).toEqual({ id: "acpx", source: "session-key" });
  });

  it("does not overlay ACP-shaped bridge sessions without ACP metadata", () => {
    const agentRuntime = computeSessionAgentRuntime({
      cfg: buildConfigWithoutAgentRuntimePolicy(),
      sessionKey: ACP_SESSION_KEY,
      fallbackAgentId: "copilot",
      acpRuntime: false,
    });

    expect(agentRuntime.id).not.toBe("acpx");
    expect(agentRuntime.source).not.toBe("session-key");
  });

  it("preserves locked Codex ownership ahead of stale MangabaClaw session metadata", () => {
    const agentRuntime = resolveModelAgentRuntimeMetadata({
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-5.5": { agentRuntime: { id: "mangabaclaw" } },
            },
          },
        },
      } as MangabaClawConfig,
      agentId: "main",
      provider: "openai",
      model: "gpt-5.5",
      sessionKey: NON_ACP_SESSION_KEY,
      sessionEntry: {
        agentHarnessId: "codex",
        agentRuntimeOverride: "mangabaclaw",
        modelSelectionLocked: true,
      },
    });

    expect(agentRuntime).toEqual({ id: "codex", source: "session" });
  });

  it("reports current model policy instead of an unlocked historical producer", () => {
    const agentRuntime = resolveCurrentSessionAgentRuntimeMetadata({
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-5.6-sol": { agentRuntime: { id: "codex" } },
            },
          },
        },
      } as MangabaClawConfig,
      agentId: "main",
      provider: "openai",
      model: "gpt-5.6-sol",
      sessionKey: NON_ACP_SESSION_KEY,
      sessionEntry: {
        agentHarnessId: "mangabaclaw",
      },
    });

    expect(agentRuntime).toEqual({ id: "codex", source: "model" });
  });

  it("keeps an explicit compatible runtime override", () => {
    const agentRuntime = resolveCurrentSessionAgentRuntimeMetadata({
      cfg: buildConfigWithoutAgentRuntimePolicy(),
      agentId: "main",
      provider: "openai",
      model: "gpt-5.6-sol",
      sessionKey: NON_ACP_SESSION_KEY,
      sessionEntry: {
        agentHarnessId: "mangabaclaw",
        agentRuntimeOverride: "codex",
      },
    });

    expect(agentRuntime).toEqual({ id: "codex", source: "session-key" });
  });
});
