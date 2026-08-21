import type { DatabaseSync } from "node:sqlite";
import type { SqliteWalMaintenance } from "../infra/sqlite-wal.js";
import type { MangabaClawStateDatabaseOptions } from "./mangabaclaw-state-db.js";

// v17 retires the tenant-free per-agent state lease table.
// v16 retires legacy top-level Media* transcript fields. It is a downgrade
// guard only; the physical schema is unchanged and Doctor owns the data rewrite.
// v15 makes board and session-sharing tables part of the canonical agent schema.
// v14 = logical session nodes, generation windows, and node-owned artifact FKs.
// v13 = one durable rewrite watermark per raw session transcript.
// v12 = session-owned ACP parent-stream events.
// v11 = durable delivery operations, canonical external conversation addresses,
// and bounded per-session heartbeat outcome context.
// v10 = materialized active transcript paths.
// v9 = SQLite STRICT tables.
// v8 added per-transcript session provenance. v7 added per-entry lifecycle status projection.
// v6 added session/transcript hot-path indexes.
// v5 added transcript mutation watermarks.
// The v4 session/transcript flip and main's v2 memory-identity
// change is folded in structure-gated migrations, so v2 main DBs and
// pre-merge v4 flip DBs both converge on this schema.
export const MANGABACLAW_AGENT_SCHEMA_VERSION = 17;

/** Open per-agent SQLite database handle plus lifecycle maintenance. */
export type MangabaClawAgentDatabase = {
  agentId: string;
  db: DatabaseSync;
  path: string;
  walMaintenance: SqliteWalMaintenance;
};

/** Options for resolving and opening one agent database. */
export type MangabaClawAgentDatabaseOptions = MangabaClawStateDatabaseOptions & {
  agentId: string;
};

/** Shared-state registry row describing an agent database seen by this process. */
export type MangabaClawRegisteredAgentDatabase = {
  agentId: string;
  path: string;
  schemaVersion: number;
  lastSeenAt: number;
  sizeBytes: number | null;
};

export type MangabaClawAgentDatabaseOwnerInspection =
  | { status: "owned"; agentId: string }
  | { status: "unowned" }
  | { status: "unreadable" };
