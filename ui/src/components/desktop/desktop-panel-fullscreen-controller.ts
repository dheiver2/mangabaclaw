import { t } from "../../i18n/index.ts";
import { formatUiError } from "../../lib/format-error.ts";
import type { MangabaClawLitElement } from "../../lit/mangabaclaw-element.ts";
import { FullscreenController } from "../fullscreen-controller.ts";

type DesktopPanelFullscreenOptions = {
  section: () => HTMLElement | null;
  onChange: () => void;
};

export class DesktopPanelFullscreenController extends FullscreenController {
  constructor(host: MangabaClawLitElement, options: DesktopPanelFullscreenOptions) {
    super(host, {
      ...options,
      buttonClass: "bp-icon desktop-fullscreen-button",
      buttonSelector: ".desktop-fullscreen-button",
      iconClass: "desktop-fullscreen-icon",
      enterLabel: () => t("desktop.enterFullscreen"),
      exitLabel: () => t("desktop.exitFullscreen"),
      unavailableLabel: () => t("desktop.fullscreenUnavailable"),
      errorMessage: (error) =>
        t("desktop.errors.fullscreenFailed", { error: formatUiError(error) }),
    });
  }
}
