// Parses gateway process command lines for process discovery.
import { normalizeLowercaseStringOrEmpty } from "@mangabaclaw/normalization-core/string-coerce";
import { normalizeStringEntries } from "@mangabaclaw/normalization-core/string-normalization";

function normalizeProcArg(arg: string): string {
  return normalizeLowercaseStringOrEmpty(arg.replaceAll("\\", "/"));
}

const ENTRY_CANDIDATES = [
  "dist/index.js",
  "dist/entry.js",
  "mangabaclaw.mjs",
  "scripts/run-node.mjs",
  "src/entry.ts",
  "src/index.ts",
] as const;

export function parseProcCmdline(raw: string): string[] {
  return normalizeStringEntries(raw.split("\0"));
}

export function isMangabaClawArgv(args: string[]): boolean {
  const normalized = args.map(normalizeProcArg);
  const exe = (normalized[0] ?? "").replace(/\.(bat|cmd|exe)$/i, "");
  if (normalized.some((arg) => ENTRY_CANDIDATES.some((entry) => arg.endsWith(entry)))) {
    return true;
  }
  return exe.endsWith("/mangabaclaw") || exe === "mangabaclaw";
}

export function isMangabaClawCommandArgv(args: string[], command: string): boolean {
  const normalizedCommand = normalizeProcArg(command);
  return args.some((arg) => normalizeProcArg(arg) === normalizedCommand) && isMangabaClawArgv(args);
}

export function isGatewayArgv(args: string[], opts?: { allowGatewayBinary?: boolean }): boolean {
  const normalized = args.map(normalizeProcArg);
  const exe = (normalized[0] ?? "").replace(/\.(bat|cmd|exe)$/i, "");
  const isGatewayBinary = exe.endsWith("/mangabaclaw-gateway") || exe === "mangabaclaw-gateway";
  if (!isMangabaClawCommandArgv(args, "gateway")) {
    return opts?.allowGatewayBinary === true && isGatewayBinary;
  }
  return true;
}
