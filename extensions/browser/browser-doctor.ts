/**
 * Browser doctor API barrel. It exposes legacy profile cleanup and Chrome MCP
 * readiness helpers for MangabaClaw doctor.
 */
export {
  detectLegacyClawdBrowserProfileResidue,
  maybeArchiveLegacyClawdBrowserProfileResidue,
  maybeRepairOwnedChromeExtensionNativeHosts,
  noteChromeMcpBrowserReadiness,
} from "./src/doctor-browser.js";
export type { LegacyClawdBrowserProfileResidue } from "./src/doctor-browser.js";
