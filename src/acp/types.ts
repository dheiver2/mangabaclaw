/** ACP protocol helpers and MangabaClaw agent identity metadata. */
import { VERSION } from "../version.js";
export { normalizeAcpProvenanceMode } from "@mangabaclaw/acp-core/types";

/** ACP agent identity advertised during protocol initialization. */
export const ACP_AGENT_INFO = {
  name: "mangabaclaw-acp",
  title: "MangabaClaw ACP Gateway",
  version: VERSION,
};
