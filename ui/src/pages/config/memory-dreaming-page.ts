// Dreams tab host. Agent selection is owned by the parent Memory page.
import { html, nothing } from "lit";
import { property } from "lit/decorators.js";
import { MangabaClawLightDomElement } from "../../lit/mangabaclaw-element.ts";
import "../agents/memory/memory-panel.ts";

class MemoryDreamingSettings extends MangabaClawLightDomElement {
  @property() agentId: string | null = null;

  override render() {
    return html`
      ${this.agentId
        ? html`<mangabaclaw-agent-memory-panel .agentId=${this.agentId}></mangabaclaw-agent-memory-panel>`
        : nothing}
    `;
  }
}

if (!customElements.get("mangabaclaw-memory-dreaming")) {
  customElements.define("mangabaclaw-memory-dreaming", MemoryDreamingSettings);
}
