import { definePage } from "@mangabaclaw/uirouter";
import { html } from "lit";
import { routePageSpec } from "../../app-route-paths.ts";

export const page = definePage({
  ...routePageSpec("portals"),
  component: () =>
    import("./portals-page.ts").then(() => ({
      header: true,
      render: () => html`<mangabaclaw-portals-page></mangabaclaw-portals-page>`,
    })),
});
