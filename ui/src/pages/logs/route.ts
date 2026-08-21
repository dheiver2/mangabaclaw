import { definePage } from "@mangabaclaw/uirouter";
import { html } from "lit";
import { routePageSpec } from "../../app-route-paths.ts";

export const page = definePage({
  ...routePageSpec("logs"),
  component: () =>
    import("./logs-page.ts").then(() => ({
      header: true,
      render: () => html`<mangabaclaw-logs-page></mangabaclaw-logs-page>`,
    })),
});
