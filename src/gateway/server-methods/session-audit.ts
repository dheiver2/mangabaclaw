import { SessionManager } from "../../agents/sessions/session-manager.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";

export async function appendSessionAudit(params: {
  cfg: MangabaClawConfig;
  target: {
    agentId: string;
    entry: Pick<SessionEntry, "sessionId">;
    sessionKey: string;
    storePath: string;
  };
  text: string;
  now: number;
}): Promise<void> {
  const identity = {
    agentId: params.target.agentId,
    sessionId: params.target.entry.sessionId,
    storePath: params.target.storePath,
  };
  SessionManager.appendMessageToTranscript(
    { ...identity, sessionKey: params.target.sessionKey },
    {
      role: "custom",
      customType: "mangabaclaw.system-note",
      content: `System note: ${params.text}`,
      display: true,
      timestamp: params.now,
    },
    { config: params.cfg },
  );
}
