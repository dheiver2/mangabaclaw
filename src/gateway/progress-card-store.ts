import type { ProgressCard, ProgressCardStep } from "../../packages/gateway-protocol/src/index.js";
import {
  readSessionProgressCard,
  writeSessionProgressCard,
} from "../session-cards/progress-card-store.js";
import { withMangabaClawAgentDatabaseReadOnly } from "../state/mangabaclaw-agent-db-readonly.js";
import {
  openMangabaClawAgentDatabase,
  runMangabaClawAgentWriteTransaction,
} from "../state/mangabaclaw-agent-db.js";
import { resolveGatewaySessionDatabase } from "./board-store.js";

export type ProgressCardStore = {
  get(sessionKey: string): ProgressCard | null;
  put(
    sessionKey: string,
    input: { markdown?: string; steps?: ProgressCardStep[]; expectedRevision?: number },
  ): { card: ProgressCard | null };
};

export const progressCardStore: ProgressCardStore = {
  get(sessionKey) {
    const resolved = resolveGatewaySessionDatabase(sessionKey);
    const result = withMangabaClawAgentDatabaseReadOnly(
      (database) => readSessionProgressCard(database.db, resolved.sessionKey),
      {
        agentId: resolved.agentId,
        ...(resolved.path ? { path: resolved.path } : {}),
      },
    );
    return result.found ? result.value : null;
  },
  put(sessionKey, input) {
    const resolved = resolveGatewaySessionDatabase(sessionKey);
    const database = openMangabaClawAgentDatabase({
      agentId: resolved.agentId,
      ...(resolved.path ? { path: resolved.path } : {}),
    });
    const result = runMangabaClawAgentWriteTransaction(
      (transactionDatabase) =>
        writeSessionProgressCard(transactionDatabase.db, resolved.sessionKey, input),
      { agentId: resolved.agentId, path: database.path },
      { operationLabel: "progress-card.put" },
    );
    return "card" in result ? result : { card: null };
  },
};
