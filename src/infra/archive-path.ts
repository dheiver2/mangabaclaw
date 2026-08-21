// Resolves archive paths through safe filesystem defaults.
import "./fs-safe-defaults.js";

// Archive path facade kept in infra so callers share one traversal policy.
export { isWindowsDrivePath } from "@mangabaclaw/fs-safe/archive";
