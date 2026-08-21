import { AgentSelect } from "./agent-select.ts";

if (!customElements.get("mangabaclaw-agent-select")) {
  customElements.define("mangabaclaw-agent-select", AgentSelect);
}
