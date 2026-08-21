import {
  agentHarnessAttemptTerminal,
  type AgentHarnessAttemptResult,
} from "mangabaclaw/plugin-sdk/agent-harness-runtime";
import type { TranscriptEntryAnchor } from "mangabaclaw/plugin-sdk/session-transcript-runtime";

export type EmbeddedRunAttemptResult = Extract<AgentHarnessAttemptResult, { terminal: unknown }> & {
  /** Host-private terminal identity returned to the harness selection boundary. */
  contextEngineTerminalAnchor?: TranscriptEntryAnchor;
};
export type AttemptFailureSource = Extract<
  EmbeddedRunAttemptResult["terminal"],
  { kind: "failed" }
>["source"];
export const attemptTerminal = agentHarnessAttemptTerminal;
