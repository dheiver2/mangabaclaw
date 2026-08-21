// Private local-only SQLite lifecycle helpers for first-party tests.

import {
  appendTranscriptEvent,
  type SessionTranscriptAccessScope,
  type TranscriptEvent,
} from "../config/sessions/session-accessor.js";

/** Appends a raw SQLite transcript event for first-party tests only. */
export async function appendSqliteSessionTranscriptEventForTest(
  params: SessionTranscriptAccessScope & { event: TranscriptEvent },
): Promise<void> {
  await appendTranscriptEvent(params, params.event);
}

export { formatSqliteSessionFileMarker } from "../config/sessions/legacy-sqlite-marker.js";
export {
  appendSqliteTrajectoryRuntimeEvents,
  loadSqliteTrajectoryRuntimeEvents,
  type SqliteTrajectoryRuntimeScope,
} from "../trajectory/runtime-store.sqlite.js";
export { createTrajectoryRuntimeRecorder as createTrajectoryRuntimeRecorderForTest } from "../trajectory/runtime.js";
export { exportTrajectoryBundle as exportTrajectoryBundleForTest } from "../trajectory/export.js";
export { type TrajectoryEvent as SqliteTrajectoryRuntimeEventForTest } from "../trajectory/types.js";
export {
  closeMangabaClawAgentDatabasesForTest,
  openMangabaClawAgentDatabase,
} from "../state/mangabaclaw-agent-db.js";
export {
  closeMangabaClawStateDatabaseForTest,
  openMangabaClawStateDatabase,
} from "../state/mangabaclaw-state-db.js";
