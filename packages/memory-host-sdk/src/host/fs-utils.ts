// Memory Host SDK helper module supports fs utils behavior.
import { configureFsSafeNative } from "@mangabaclaw/fs-safe/config";
// fs-safe facade with native acceleration disabled by default for this package's
// host-side memory file operations.
export { root } from "@mangabaclaw/fs-safe/root";
export { isPathInside, isPathInsideWithRealpath } from "@mangabaclaw/fs-safe/path";
export {
  assertNoSymlinkParents,
  readRegularFile,
  statRegularFile,
} from "@mangabaclaw/fs-safe/advanced";
export { walkDirectory, type WalkDirectoryEntry } from "@mangabaclaw/fs-safe/walk";

const hasModeOverride = Object.keys(process.env).some((key) =>
  /^(?:MANGABACLAW_)?FS_SAFE_(?:NATIVE|PYTHON)_MODE$/u.test(
    process.platform === "win32" ? key.toUpperCase() : key,
  ),
);

if (!hasModeOverride) {
  configureFsSafeNative({ mode: "off" });
}

/**
 * True for missing-file errors emitted by Node or fs-safe.
 * The narrowed union stays stable; extra-path authorization handles `not-file` separately.
 */
export function isFileMissingError(
  err: unknown,
): err is NodeJS.ErrnoException & { code: "ENOENT" | "ENOTDIR" | "not-file" | "not-found" } {
  if (!err || typeof err !== "object" || !("code" in err)) {
    return false;
  }
  return (
    err.code === "ENOENT" ||
    err.code === "ENOTDIR" ||
    err.code === "not-file" ||
    err.code === "not-found"
  );
}
