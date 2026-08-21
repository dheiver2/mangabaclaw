import { MangabaClawFilePreviewModal } from "./file-preview-modal.ts";

if (!customElements.get("mangabaclaw-file-preview-modal")) {
  customElements.define("mangabaclaw-file-preview-modal", MangabaClawFilePreviewModal);
}
