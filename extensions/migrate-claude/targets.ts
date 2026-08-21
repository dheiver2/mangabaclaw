// Migrate Claude plugin re-exports the shared migration target resolution.
export {
  resolvePlannedMigrationTargets as resolveTargets,
  type PlannedMigrationTargets as PlannedTargets,
} from "mangabaclaw/plugin-sdk/migration-runtime";
