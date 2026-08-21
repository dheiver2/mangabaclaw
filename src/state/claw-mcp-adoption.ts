import { existsSync } from "node:fs";
import {
  runMangabaClawStateWriteTransaction,
  type MangabaClawStateDatabaseOptions,
} from "./mangabaclaw-state-db.js";
import { resolveMangabaClawStateSqlitePath } from "./mangabaclaw-state-db.paths.js";

/** Records an explicit non-Claw claim through the canonical MCP owner. */
export function markClawMcpServerIndependentlyOwned(
  name: string,
  options: MangabaClawStateDatabaseOptions & { nowMs?: number } = {},
): number {
  const databasePath = options.path ?? resolveMangabaClawStateSqlitePath(options.env ?? process.env);
  if (!existsSync(databasePath)) {
    return 0;
  }
  try {
    return runMangabaClawStateWriteTransaction(({ db }) => {
      const result =
        db /* sqlite-allow-raw: record a current non-Claw MCP owner after direct config. */
          .prepare(
            `UPDATE claw_mcp_server_refs
                SET independent_owner = 1, updated_at_ms = @updated_at_ms
              WHERE name = @name AND independent_owner <> 1`,
          )
          .run({ name, updated_at_ms: options.nowMs ?? Date.now() });
      return Number(result.changes);
    }, options);
  } catch {
    // The canonical MCP write already succeeded; Claw status still detects config drift.
    return 0;
  }
}
