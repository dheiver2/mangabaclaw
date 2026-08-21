// Public custom-element entrypoint for the Control UI chat pane.
import { ChatPane } from "./chat-pane-render.ts";

if (!customElements.get("mangabaclaw-chat-pane")) {
  customElements.define("mangabaclaw-chat-pane", ChatPane);
}

declare global {
  interface HTMLElementTagNameMap {
    "mangabaclaw-chat-pane": ChatPane;
  }
}
