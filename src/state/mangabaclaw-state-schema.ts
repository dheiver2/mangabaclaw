import { fileURLToPath } from "node:url";

// Use the native builtin so unrelated node:fs mocks cannot replace this source input.
// Production builds replace this module so packaged database opens need no asset file.
export const MANGABACLAW_STATE_SCHEMA_SQL = process
  .getBuiltinModule("node:fs")
  .readFileSync(fileURLToPath(new URL("./mangabaclaw-state-schema.sql", import.meta.url)), "utf8");
