// MangabaClaw root resolution imports fs through this facade so tests can replace
// filesystem behavior without mocking node:fs globally.
export { default as mangabaClawRootFsSync } from "node:fs"; // Sanctioned domain alias.
export { default as mangabaClawRootFs } from "node:fs/promises"; // Sanctioned domain alias.
