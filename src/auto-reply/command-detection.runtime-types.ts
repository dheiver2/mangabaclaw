/** Runtime type contracts for command-detection helpers loaded across lazy boundaries. */
import type { MangabaClawConfig } from "../config/types.js";
import type { CommandNormalizeOptions } from "./commands-registry.types.js";

/** Runtime-injected predicate for deciding whether visible text is an MangabaClaw command. */
export type IsControlCommandMessage = (
  text?: string,
  cfg?: MangabaClawConfig,
  options?: CommandNormalizeOptions,
) => boolean;

/** Runtime-injected predicate for deciding whether command authorization must be computed. */
export type ShouldComputeCommandAuthorized = (
  text?: string,
  cfg?: MangabaClawConfig,
  options?: CommandNormalizeOptions,
) => boolean;
