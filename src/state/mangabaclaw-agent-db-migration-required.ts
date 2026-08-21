export const GATEWAY_AGENT_MEDIA_MIGRATION_REQUIRED_REASON =
  "gateway.agent_media_migration_required";

export class MangabaClawAgentDatabaseMediaMigrationRequiredError extends Error {
  readonly code = GATEWAY_AGENT_MEDIA_MIGRATION_REQUIRED_REASON;

  constructor(
    readonly pathname: string,
    readonly schemaVersion: number,
  ) {
    super(
      `MangabaClaw agent database ${pathname} uses schema version ${schemaVersion}; run mangabaclaw doctor --fix to migrate persisted media before using it.`,
    );
    this.name = "MangabaClawAgentDatabaseMediaMigrationRequiredError";
  }
}

const AGENT_MEDIA_MIGRATION_REQUIRED_MESSAGE =
  /^MangabaClaw agent database (.+) uses schema version (\d+); run mangabaclaw doctor --fix to migrate persisted media before using it\.$/u;

function parseAgentMediaMigrationRequiredMessage(
  message: unknown,
): MangabaClawAgentDatabaseMediaMigrationRequiredError | undefined {
  if (typeof message !== "string") {
    return undefined;
  }
  const match = AGENT_MEDIA_MIGRATION_REQUIRED_MESSAGE.exec(message);
  const pathname = match?.[1];
  const rawSchemaVersion = match?.[2];
  if (!pathname || !rawSchemaVersion) {
    return undefined;
  }
  const schemaVersion = Number(rawSchemaVersion);
  if (!Number.isSafeInteger(schemaVersion)) {
    return undefined;
  }
  return new MangabaClawAgentDatabaseMediaMigrationRequiredError(pathname, schemaVersion);
}

export function findMangabaClawAgentDatabaseMediaMigrationRequiredError(
  error: unknown,
): MangabaClawAgentDatabaseMediaMigrationRequiredError | undefined {
  let current = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    if (current instanceof MangabaClawAgentDatabaseMediaMigrationRequiredError) {
      return current;
    }
    const errorLike = current as { cause?: unknown; message?: unknown };
    const parsed = parseAgentMediaMigrationRequiredMessage(errorLike.message);
    if (parsed) {
      return parsed;
    }
    seen.add(current);
    current = errorLike.cause;
  }
  return undefined;
}

export function formatLegacyAgentMediaMigrationRequiredMessage(
  pathname: string,
  schemaVersion: number,
): string {
  return new MangabaClawAgentDatabaseMediaMigrationRequiredError(pathname, schemaVersion).message;
}
