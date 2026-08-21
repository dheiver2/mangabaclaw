/** Doctor warning for missing command owners on privileged channel commands. */
import { normalizeOptionalString } from "@mangabaclaw/normalization-core/string-coerce";
import { normalizeStringEntries } from "@mangabaclaw/normalization-core/string-normalization";
import { note } from "../../packages/terminal-core/src/note.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import type { PairingChannel } from "../pairing/pairing-store.types.js";

function resolveConfiguredCommandOwners(cfg: MangabaClawConfig): string[] {
  const owners = cfg.commands?.ownerAllowFrom;
  if (!Array.isArray(owners)) {
    return [];
  }
  return normalizeStringEntries(owners.map((entry) => String(entry ?? ""))).filter(
    (entry) => entry !== "*" && !entry.endsWith(":*"),
  );
}

/** Returns true when at least one owner sender id is configured. */
export function hasConfiguredCommandOwners(cfg: MangabaClawConfig): boolean {
  return resolveConfiguredCommandOwners(cfg).length > 0;
}

/** Formats a channel sender id into the commands.ownerAllowFrom entry shape. */
export function formatCommandOwnerFromChannelSender(params: {
  channel: PairingChannel;
  id: string;
}): string | null {
  const id = normalizeOptionalString(params.id);
  if (!id) {
    return null;
  }
  const separatorIndex = id.indexOf(":");
  if (separatorIndex > 0) {
    const prefix = id.slice(0, separatorIndex);
    if (prefix.toLowerCase() === String(params.channel).toLowerCase()) {
      return id;
    }
  }
  return `${params.channel}:${id}`;
}

/** Emits setup guidance when privileged command ownership is not configured. */
export function noteCommandOwnerHealth(cfg: MangabaClawConfig): void {
  if (hasConfiguredCommandOwners(cfg)) {
    return;
  }
  note(
    [
      "No command owner is configured.",
      "A command owner is the human operator account allowed to run owner-only commands and approve dangerous actions, including /diagnostics, /export-session, /export-trajectory, /config, and exec approvals.",
      "DM pairing only lets someone talk to the bot; it does not make that sender the owner for privileged commands.",
      `Fix: set commands.ownerAllowFrom to your channel user id, for example ${formatCliCommand("mangabaclaw config set commands.ownerAllowFrom '[\"telegram:123456789\"]'")}`,
      "Restart the gateway after changing this if it is already running.",
    ].join("\n"),
    "Command owner",
  );
}
