import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HealthCheck } from "mangabaclaw/plugin-sdk/health";
import { resolveMangabaClawRoot } from "./src/crabbox-worker-profile.js";
import {
  CRABBOX_CLOUD_WORKER_PROFILE_CHECK_ID,
  registerCrabboxWorkerProviderDoctorChecks as registerChecks,
} from "./src/doctor.js";

const CRABBOX_PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url));

export { CRABBOX_CLOUD_WORKER_PROFILE_CHECK_ID };

export function registerWorkerProviderDoctorChecks(host: {
  registerHealthCheck(check: HealthCheck): void;
}): void {
  registerChecks({
    ...host,
    mangabaclawRoot: resolveMangabaClawRoot(CRABBOX_PLUGIN_ROOT),
  });
}
