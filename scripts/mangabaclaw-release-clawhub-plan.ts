#!/usr/bin/env -S node --import tsx
// MangabaClaw release ClawHub plan CLI emits release workflow routing as JSON.

import { pathToFileURL } from "node:url";
import {
  buildMangabaClawReleaseClawHubPlan,
  parseMangabaClawReleaseClawHubPlanArgs,
} from "./lib/mangabaclaw-release-clawhub-plan.ts";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = parseMangabaClawReleaseClawHubPlanArgs(process.argv.slice(2));
  const plan = await buildMangabaClawReleaseClawHubPlan(args);
  console.log(JSON.stringify(plan, null, 2));
}
