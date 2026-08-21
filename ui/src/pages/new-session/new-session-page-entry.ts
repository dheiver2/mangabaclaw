import { html } from "lit";
import { NewSessionPage } from "./new-session-page.ts";

if (!customElements.get("mangabaclaw-new-session-page")) {
  customElements.define("mangabaclaw-new-session-page", NewSessionPage);
}

export const render = (data: unknown) =>
  html`<mangabaclaw-new-session-page .data=${data}></mangabaclaw-new-session-page>`;
