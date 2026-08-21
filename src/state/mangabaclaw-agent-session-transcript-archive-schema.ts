import type { DatabaseSync } from "node:sqlite";
import { runSqliteImmediateTransactionSync } from "../infra/sqlite-transaction.js";
import { MANGABACLAW_AGENT_SCHEMA_SQL } from "./mangabaclaw-agent-schema.js";

export const SESSION_TRANSCRIPT_ARCHIVES_TABLE = "session_transcript_archives";

const ARCHIVE_SCHEMA_START = `CREATE TABLE IF NOT EXISTS ${SESSION_TRANSCRIPT_ARCHIVES_TABLE} (`;
const ARCHIVE_SCHEMA_END = "CREATE TABLE IF NOT EXISTS transcript_rewrite_watermarks (";
const ENSURED_DATABASES = new WeakSet<DatabaseSync>();

function sessionTranscriptArchiveSchemaSql(): string {
  const start = MANGABACLAW_AGENT_SCHEMA_SQL.indexOf(ARCHIVE_SCHEMA_START);
  const end = MANGABACLAW_AGENT_SCHEMA_SQL.indexOf(ARCHIVE_SCHEMA_END, start);
  if (start === -1 || end === -1) {
    throw new Error("MangabaClaw session transcript archive schema markers are missing.");
  }
  return MANGABACLAW_AGENT_SCHEMA_SQL.slice(start, end);
}

/** Lazily installs the additive canonical archive owner on first archive use. */
export function ensureSessionTranscriptArchiveSchema(db: DatabaseSync): void {
  if (ENSURED_DATABASES.has(db)) {
    return;
  }
  const ensure = () => {
    db.exec(sessionTranscriptArchiveSchemaSql()); // sqlite-allow-raw -- Canonical additive DDL only.
  };
  if (db.isTransaction) {
    ensure();
    return;
  }
  runSqliteImmediateTransactionSync(db, ensure);
  ENSURED_DATABASES.add(db);
}
