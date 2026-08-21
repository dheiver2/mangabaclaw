import { MANGABACLAW_DATABASE_SCHEMA_DOCS_URL } from "../state/mangabaclaw-state-db-contract.js";
import { VERSION } from "../version.js";
import { resolveCommitHash } from "./git-commit.js";
import { resolveMangabaClawPackageRootSync } from "./mangabaclaw-root.js";

type SqliteUserVersionReader = {
  prepare: (sql: string) => { get: () => unknown };
};

const SQLITE_SCHEMA_VERSION_ERROR_NAME = "SqliteSchemaVersionError";

export function isSqliteSchemaVersionError(error: unknown): error is Error {
  return error instanceof Error && error.name === SQLITE_SCHEMA_VERSION_ERROR_NAME;
}

export function readSqliteUserVersion(db: SqliteUserVersionReader): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version?: unknown } | undefined;
  return Number(row?.user_version ?? 0);
}

/**
 * Name the refusing install the way `--version` does, plus the root it runs from.
 * The path is the only part an operator can always act on: one release version
 * string spans many commits, and a linked source checkout reports its git HEAD
 * even when the built output actually executing is older.
 */
export function describeRunningMangabaClawBuild(): string {
  const moduleUrl = import.meta.url;
  const commit = resolveCommitHash({ moduleUrl });
  const root = resolveMangabaClawPackageRootSync({ moduleUrl });
  const identity = commit ? `MangabaClaw ${VERSION} (${commit})` : `MangabaClaw ${VERSION}`;
  return root ? `${identity} installed at ${root}` : identity;
}

export function createNewerSqliteSchemaVersionError(
  databaseLabel: string,
  pathname: string,
  schemaVersion: number,
  supportedVersion: number,
): Error {
  const error = new Error(
    `${databaseLabel} ${pathname} uses newer schema version ${schemaVersion}; this build supports ${supportedVersion}. ` +
      `Refused by ${describeRunningMangabaClawBuild()}. ` +
      "Identify installs by that path: one version string spans many builds, and a linked source checkout reports its git HEAD even when its built output is older. " +
      `Run a build that supports schema ${schemaVersion} or newer against this state directory — rebuild or update the install above — or point this build at a different MANGABACLAW_STATE_DIR. ` +
      `See ${MANGABACLAW_DATABASE_SCHEMA_DOCS_URL}.`,
  );
  error.name = SQLITE_SCHEMA_VERSION_ERROR_NAME;
  return error;
}
