import { createHash } from "node:crypto";
import { stableStringify } from "@mangabaclaw/normalization-core";
import type { AgentConfig } from "../config/types.agents.js";

export function digestClawAgentConfig(agent: AgentConfig): string {
  return `sha256:${createHash("sha256").update(stableStringify(agent)).digest("hex")}`;
}
