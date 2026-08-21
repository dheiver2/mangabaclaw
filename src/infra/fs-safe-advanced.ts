// Provides stricter filesystem helpers for canonical path and symlink-sensitive operations.
import "./fs-safe-defaults.js";

// Advanced fs-safe helpers for symlink, hardlink, and sibling-temp protections.
export {
  assertNoSymlinkParents,
  assertNoSymlinkParentsSync,
  readFileHandleBounded,
  type FileIdentityStat,
  sameFileIdentity,
  sanitizeUntrustedFileName,
} from "@mangabaclaw/fs-safe/advanced";
export { readSecretFile } from "@mangabaclaw/fs-safe/secret";
