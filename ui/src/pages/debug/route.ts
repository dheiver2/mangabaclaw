import { definePage } from "@mangabaclaw/uirouter";
import { html } from "lit";
import { routePageSpec } from "../../app-route-paths.ts";

export const page = definePage({
  ...routePageSpec("debug"),
  component: () =>
    import("./debug-page.ts").then(() => ({
      header: true,
      render: () => html`<mangabaclaw-debug-page></mangabaclaw-debug-page>`,
    })),
});
