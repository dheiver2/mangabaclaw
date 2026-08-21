import {
  rewriteDoctorSessionEntries,
  scanDoctorSessionEntriesTolerant,
} from "../config/sessions/session-accessor.js";
import { stripRuntimeOnlySessionSkillsFields } from "../config/sessions/store-entry-shape.js";
import type { SessionEntry } from "../config/sessions/types.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { normalizeLegacySessionEntryDelivery } from "../infra/state-migrations.legacy-session-store.js";
import {
  closeMangabaClawAgentDatabaseByPath,
  isMangabaClawAgentDatabaseOpen,
} from "../state/mangabaclaw-agent-db.js";
import { runDoctorAgentDatabaseOperation } from "./doctor-agent-database-operation.js";
import { listExistingAgentDatabaseTargets } from "./doctor-session-sqlite-readers.js";

export type SessionDeliveryStateRepairReport = {
  found: number;
  repaired: number;
  scannedStores: number;
};

/** Scan or rewrite legacy delivery fields inside existing session row JSON. */
export function repairCanonicalSessionDeliveryStates(params: {
  apply: boolean;
  cfg: MangabaClawConfig;
  env: NodeJS.ProcessEnv;
}): SessionDeliveryStateRepairReport {
  return repairCanonicalSessionEntries({
    ...params,
    transform: normalizeLegacySessionEntryDelivery,
    updateDeliveryProjection: true,
  });
}

/** Removes runtime-only skill catalogs from previously persisted session rows. */
export function repairCanonicalSessionResolvedSkills(params: {
  apply: boolean;
  cfg: MangabaClawConfig;
  env: NodeJS.ProcessEnv;
}): SessionDeliveryStateRepairReport {
  return repairCanonicalSessionEntries({
    ...params,
    transform: stripRuntimeOnlySessionSkillsFields,
    updateDeliveryProjection: false,
  });
}

function repairCanonicalSessionEntries(params: {
  apply: boolean;
  cfg: MangabaClawConfig;
  env: NodeJS.ProcessEnv;
  transform: (entry: SessionEntry) => SessionEntry;
  updateDeliveryProjection: boolean;
}): SessionDeliveryStateRepairReport {
  const targets = listExistingAgentDatabaseTargets(params.cfg, params.env);
  let found = 0;
  let repaired = 0;
  for (const target of targets) {
    const sessionKeys: string[] = [];
    const operation = runDoctorAgentDatabaseOperation({
      agentId: target.agentId,
      path: target.sqlitePath,
      run: () => {
        scanDoctorSessionEntriesTolerant(
          { agentId: target.agentId, env: params.env, storePath: target.storePath },
          ({ entry, recoveredFromProjections, sessionKey }) => {
            if (!recoveredFromProjections && params.transform(entry) !== entry) {
              sessionKeys.push(sessionKey);
            }
          },
        );
        return sessionKeys.length;
      },
    });
    if (!operation.ok) {
      continue;
    }
    found += operation.value;
    if (!params.apply || operation.value === 0) {
      continue;
    }
    const wasOpen = isMangabaClawAgentDatabaseOpen(target.sqlitePath);
    try {
      repaired += rewriteDoctorSessionEntries({
        scope: { agentId: target.agentId, env: params.env, storePath: target.storePath },
        sessionKeys,
        transform: params.transform,
        updateDeliveryProjection: params.updateDeliveryProjection,
      });
    } finally {
      if (!wasOpen) {
        closeMangabaClawAgentDatabaseByPath(target.sqlitePath);
      }
    }
  }
  return { found, repaired, scannedStores: targets.length };
}
