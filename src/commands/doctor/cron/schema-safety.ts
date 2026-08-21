import { isSqliteSchemaVersionError } from "../../../infra/sqlite-user-version.js";
import { withExistingMangabaClawStateDatabaseArtifactPreservingReadOnly } from "../../../state/mangabaclaw-state-db-readonly.js";

export function assertCronStateSchemaSupported(env?: NodeJS.ProcessEnv): void {
  withExistingMangabaClawStateDatabaseArtifactPreservingReadOnly(() => undefined, { env });
}

export function rethrowSqliteSchemaVersionError(error: unknown): void {
  if (isSqliteSchemaVersionError(error)) {
    throw error;
  }
}
