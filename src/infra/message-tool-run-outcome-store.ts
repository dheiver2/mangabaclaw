import type { Insertable } from "kysely";
import {
  resolveSqliteScope,
  toDatabaseOptions,
} from "../config/sessions/session-accessor.sqlite-scope.js";
import type { DB as MangabaClawAgentKyselyDatabase } from "../state/mangabaclaw-agent-db.generated.js";
import {
  openMangabaClawAgentDatabase,
  runMangabaClawAgentWriteTransaction,
} from "../state/mangabaclaw-agent-db.js";
import { ensureMessageToolRunOutcomeSchema } from "../state/mangabaclaw-agent-message-tool-outcome-schema.js";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "./kysely-sync.js";

const MESSAGE_TOOL_RUN_OUTCOME_MAX_ROWS = 10_000;

type MessageToolRunOutcomeTable = MangabaClawAgentKyselyDatabase["message_tool_run_outcomes"];
type MessageToolRunOutcomeDatabase = Pick<MangabaClawAgentKyselyDatabase, "message_tool_run_outcomes">;
type MessageToolRunOutcomeInsert = Insertable<MessageToolRunOutcomeTable>;

/** Records one bounded completion fact for a message-tool-only run. */
export function recordMessageToolRunOutcome(params: {
  runId: string;
  sessionKey: string;
  agentId: string;
  provider: string;
  model: string;
  outcome: "tool_delivered" | "mute";
  runStatus: "completed" | "errored" | "aborted";
  occurredAt: number;
  storePath?: string;
  env?: NodeJS.ProcessEnv;
}): void {
  const values: MessageToolRunOutcomeInsert = {
    run_id: params.runId,
    session_key: params.sessionKey,
    agent_id: params.agentId,
    provider: params.provider,
    model: params.model,
    outcome: params.outcome,
    run_status: params.runStatus,
    occurred_at: params.occurredAt,
  };
  const databaseOptions = toDatabaseOptions(resolveSqliteScope(params));
  ensureMessageToolRunOutcomeSchema(openMangabaClawAgentDatabase(databaseOptions).db);
  runMangabaClawAgentWriteTransaction(
    ({ db }) => {
      const agentDb = getNodeSqliteKysely<MessageToolRunOutcomeDatabase>(db);
      executeSqliteQuerySync(db, agentDb.insertInto("message_tool_run_outcomes").values(values));
      executeSqliteQuerySync(
        db,
        agentDb
          .deleteFrom("message_tool_run_outcomes")
          .where(
            "id",
            "in",
            agentDb
              .selectFrom("message_tool_run_outcomes")
              .select("id")
              .orderBy("occurred_at", "desc")
              .orderBy("id", "desc")
              .limit(2_147_483_647)
              .offset(MESSAGE_TOOL_RUN_OUTCOME_MAX_ROWS),
          ),
      );
    },
    databaseOptions,
    { operationLabel: "message-tool.run-outcome.record" },
  );
}
