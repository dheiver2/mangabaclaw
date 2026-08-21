import { definePage } from "@openclaw/uirouter";
import { html } from "lit";
import { routePageSpec } from "../../app-route-paths.ts";

export const page = definePage({
  ...routePageSpec("worktrees"),
  component: () =>
    import("./worktrees-page.ts").then(() => ({
      header: true,
      render: () => html`<mangabaclaw-worktrees-page></mangabaclaw-worktrees-page>`,
    })),
});
