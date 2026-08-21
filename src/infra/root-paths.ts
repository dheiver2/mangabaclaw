// Exposes root-scoped path resolution helpers with fs-safe defaults.
import "./fs-safe-defaults.js";

// Root path helpers resolve writable and existing paths without allowing
// traversal outside the configured root.
export {
  resolveExistingPathsWithinRoot,
  resolveStrictExistingPathsWithinRoot,
} from "@mangabaclaw/fs-safe/advanced";
export { pathScope } from "@mangabaclaw/fs-safe/advanced";
