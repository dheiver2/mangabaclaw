export type MangabaClawSchemaVersions = {
  state: number;
  agent: number;
};

export function parseMangabaClawSchemaVersions(value: unknown): MangabaClawSchemaVersions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (
    !Number.isInteger(record.state) ||
    (record.state as number) < 0 ||
    !Number.isInteger(record.agent) ||
    (record.agent as number) < 0
  ) {
    return undefined;
  }
  return { state: record.state as number, agent: record.agent as number };
}

export function parsePackageMangabaClawSchemaVersions(
  packageJson: unknown,
): MangabaClawSchemaVersions | undefined {
  if (!packageJson || typeof packageJson !== "object" || Array.isArray(packageJson)) {
    return undefined;
  }
  const mangabaclaw = (packageJson as Record<string, unknown>).mangabaclaw;
  if (!mangabaclaw || typeof mangabaclaw !== "object" || Array.isArray(mangabaclaw)) {
    return undefined;
  }
  return parseMangabaClawSchemaVersions((mangabaclaw as Record<string, unknown>).schemaVersions);
}
