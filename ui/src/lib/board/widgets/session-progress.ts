import { consume } from "@lit/context";
import { html } from "lit";
import { property } from "lit/decorators.js";
import { applicationContext, type ApplicationContext } from "../../../app/context.ts";
import { renderSessionProgressCard } from "../../../components/session-progress-card.ts";
import { t } from "../../../i18n/index.ts";
import { MangabaClawLightDomElement } from "../../../lit/mangabaclaw-element.ts";
import {
  sessionProgressCardsForGateway,
  type SessionProgressCardStore,
} from "../../session-progress-cards.ts";
import type { BoardWidget } from "../types.ts";
import type { PluginBoardWidgetRenderer } from "./index.ts";

function readSessionKeyProp(widget: BoardWidget | undefined): string | undefined {
  const value = widget?.props?.sessionKey;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

class MangabaClawSessionProgressWidget extends MangabaClawLightDomElement {
  @consume({ context: applicationContext, subscribe: true })
  private context?: ApplicationContext;

  @property({ attribute: false }) widget?: BoardWidget;
  @property({ attribute: false }) sessionKey = "";
  @property({ attribute: false }) active = true;

  private store?: SessionProgressCardStore;
  private targetSessionKey = "";
  private unsubscribe?: () => void;

  override connectedCallback(): void {
    super.connectedCallback();
    this.syncStore();
  }

  override willUpdate(): void {
    this.syncStore();
  }

  override disconnectedCallback(): void {
    this.releaseStore();
    super.disconnectedCallback();
  }

  override render() {
    const loadError = this.store?.getError(this.targetSessionKey);
    if (loadError) {
      return html`<div
        class="board-widget__plugin-loading"
        data-test-id="session-progress-error"
        role="alert"
      >
        <span
          >${t(
            loadError === "access-denied"
              ? "sessionProgressCard.widgetAccessDenied"
              : "sessionProgressCard.widgetUnavailable",
          )}</span
        >
        ${loadError === "unavailable"
          ? html`<button class="btn btn--sm" type="button" @click=${this.retryLoad}>
              ${t("common.retry")}
            </button>`
          : null}
      </div>`;
    }
    const card = this.store?.get(this.targetSessionKey);
    if (card === undefined) {
      return html`<p class="board-widget__plugin-loading">
        ${t("sessionProgressCard.widgetLoading")}
      </p>`;
    }
    if (card === null) {
      return html`<p class="board-widget__plugin-loading">
        ${t("sessionProgressCard.widgetEmpty")}
      </p>`;
    }
    return renderSessionProgressCard(card, "board");
  }

  private syncStore(): void {
    const targetSessionKey = readSessionKeyProp(this.widget) ?? this.sessionKey.trim();
    const store =
      this.active && this.context
        ? sessionProgressCardsForGateway(this.context.gateway)
        : undefined;
    if (store === this.store && targetSessionKey === this.targetSessionKey) {
      return;
    }
    this.releaseStore();
    this.store = store;
    this.targetSessionKey = targetSessionKey;
    if (store && targetSessionKey) {
      store.watch(this, [targetSessionKey]);
      this.unsubscribe = store.subscribe(() => this.requestUpdate());
    }
  }

  private readonly retryLoad = () => {
    if (!this.store || !this.targetSessionKey) {
      return;
    }
    void this.store.load(this.targetSessionKey).catch(() => undefined);
  };

  private releaseStore(): void {
    this.store?.unwatch(this);
    this.unsubscribe?.();
    this.store = undefined;
    this.unsubscribe = undefined;
  }
}

if (!customElements.get("mangabaclaw-session-progress-widget")) {
  customElements.define("mangabaclaw-session-progress-widget", MangabaClawSessionProgressWidget);
}

export const renderSessionProgressWidget: PluginBoardWidgetRenderer = ({
  widget,
  sessionKey,
  active,
}) => html`
  <mangabaclaw-session-progress-widget
    .widget=${widget}
    .sessionKey=${sessionKey}
    .active=${active}
  ></mangabaclaw-session-progress-widget>
`;

declare global {
  interface HTMLElementTagNameMap {
    "mangabaclaw-session-progress-widget": MangabaClawSessionProgressWidget;
  }
}
