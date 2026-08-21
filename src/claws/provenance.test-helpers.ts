import { join } from "node:path";
import { openMangabaClawStateDatabase } from "../state/mangabaclaw-state-db.js";
import { buildClawAddPlan } from "./lifecycle.js";
import { parseClawManifest } from "./schema.js";
import type { ClawMangabaClawProfile, ClawSourceIdentity } from "./types.js";

export async function makeProvenancePlan(
  root: string,
  manifestValue: unknown,
  options: {
    workspace?: string;
    mangabaClawProfile?: ClawMangabaClawProfile;
    packagePreflight?: NonNullable<
      Parameters<typeof buildClawAddPlan>[0]["context"]
    >["packagePreflight"];
  } = {},
) {
  const parsed = parseClawManifest(manifestValue);
  if (!parsed.ok) {
    throw new Error(JSON.stringify(parsed.diagnostics));
  }
  const source: ClawSourceIdentity = {
    kind: "package",
    name: "@acme/worker",
    version: "1.0.0",
    packageRoot: root,
    manifestPath: join(root, "mangabaclaw.claw.json"),
    integrityKind: "artifact",
    integrity: "sha256:manifest",
    byteLength: 123,
  };
  const plan = await buildClawAddPlan({
    manifest: parsed.manifest,
    mangabaClawProfile: options.mangabaClawProfile,
    source,
    context: {
      workspace: options.workspace ?? join(root, "workspace-worker"),
      ...(options.packagePreflight ? { packagePreflight: options.packagePreflight } : {}),
    },
  });
  return { root, plan };
}

export function stateEnv(root: string) {
  return { MANGABACLAW_STATE_DIR: join(root, "state") };
}

export function readInstallRow(agentId: string, root: string) {
  return openMangabaClawStateDatabase({ env: stateEnv(root) })
    .db.prepare(
      `SELECT agent_id, schema_version, claw_name, claw_version, integrity, plan_integrity,
              workspace, agent_config_digest, agent_owned_paths_json, status, added_at_ms
         FROM claw_installs
        WHERE agent_id = ?`,
    )
    .get(agentId) as
    | {
        agent_id: string;
        schema_version: string;
        claw_name: string;
        claw_version: string;
        integrity: string;
        plan_integrity: string;
        workspace: string;
        agent_config_digest: string;
        agent_owned_paths_json: string;
        status: string;
        added_at_ms: number | bigint;
      }
    | undefined;
}
