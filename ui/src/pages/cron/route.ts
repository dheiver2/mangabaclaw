import { definePage } from "@mangabaclaw/uirouter";
import { routePageSpec } from "../../app-route-paths.ts";

export const page = definePage({
  ...routePageSpec("cron"),
  component: () => import("./cron-page.ts"),
});
