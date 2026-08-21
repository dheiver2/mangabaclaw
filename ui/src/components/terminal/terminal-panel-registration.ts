import { MangabaClawTerminalPanel } from "./terminal-panel.ts";

// Guarded define so shared registries can retain this module across reloads.
if (!customElements.get("mangabaclaw-terminal-panel")) {
  customElements.define("mangabaclaw-terminal-panel", MangabaClawTerminalPanel);
}
