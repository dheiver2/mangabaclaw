import type { RouteLocation } from "@mangabaclaw/uirouter";
import { definePage } from "@mangabaclaw/uirouter";
import { routePageSpec } from "../../app-route-paths.ts";
import type { ApplicationContext } from "../../app/context.ts";

export const page = definePage({
  ...routePageSpec("new-session"),
  loaderDeps: (_context: ApplicationContext, location: RouteLocation) => location.search,
  loader: async (context: ApplicationContext, { location }) =>
    (await import("./route-loader.ts")).load(context, location.search),
  component: () => import("./new-session-page-entry.ts"),
});
