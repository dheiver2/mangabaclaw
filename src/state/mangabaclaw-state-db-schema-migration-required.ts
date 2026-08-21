const GATEWAY_STATE_SCHEMA_MIGRATION_REQUIRED_REASON = "gateway.state_schema_migration_required";

type MangabaClawStateDatabaseSchemaMigrationRequiredKind =
  | "agent-databases-composite-primary-key"
  | "audit-events-v2";

export class MangabaClawStateDatabaseSchemaMigrationRequiredError extends Error {
  readonly code = GATEWAY_STATE_SCHEMA_MIGRATION_REQUIRED_REASON;

  constructor(
    readonly kind: MangabaClawStateDatabaseSchemaMigrationRequiredKind,
    readonly pathname: string,
  ) {
    super(
      `MangabaClaw state database schema migration required (${kind}) at ${pathname}; run mangabaclaw doctor --fix to migrate it.`,
    );
    this.name = "MangabaClawStateDatabaseSchemaMigrationRequiredError";
  }
}

const STATE_SCHEMA_MIGRATION_REQUIRED_MESSAGE =
  /^MangabaClaw state database schema migration required \((agent-databases-composite-primary-key|audit-events-v2)\) at (.+); run mangabaclaw doctor --fix to migrate it\.$/u;

function parseStateSchemaMigrationRequiredMessage(
  message: unknown,
): MangabaClawStateDatabaseSchemaMigrationRequiredError | undefined {
  if (typeof message !== "string") {
    return undefined;
  }
  const match = STATE_SCHEMA_MIGRATION_REQUIRED_MESSAGE.exec(message);
  const kind = match?.[1] as MangabaClawStateDatabaseSchemaMigrationRequiredKind | undefined;
  const pathname = match?.[2];
  if (!kind || !pathname) {
    return undefined;
  }
  return new MangabaClawStateDatabaseSchemaMigrationRequiredError(kind, pathname);
}

export function findMangabaClawStateDatabaseSchemaMigrationRequiredError(
  error: unknown,
): MangabaClawStateDatabaseSchemaMigrationRequiredError | undefined {
  let current = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    if (current instanceof MangabaClawStateDatabaseSchemaMigrationRequiredError) {
      return current;
    }
    const errorLike = current as { cause?: unknown; message?: unknown };
    const parsed = parseStateSchemaMigrationRequiredMessage(errorLike.message);
    if (parsed) {
      return parsed;
    }
    seen.add(current);
    current = errorLike.cause;
  }
  return undefined;
}
