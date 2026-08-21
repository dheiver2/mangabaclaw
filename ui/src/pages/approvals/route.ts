import { definePage } from "@openclaw/uirouter";
import { html } from "lit";
import { routePageSpec } from "../../app-route-paths.ts";

export const page = definePage({
  ...routePageSpec("approvals"),
  component: () =>
    import("./approvals-page.ts").then(() => ({
      header: true,
      render: () => html`<mangabaclaw-approvals-page></mangabaclaw-approvals-page>`,
    })),
});
