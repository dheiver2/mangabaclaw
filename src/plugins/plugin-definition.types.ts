import type { MangabaClawPluginApi } from "./plugin-api.types.js";
import type { MangabaClawPluginConfigSchema } from "./plugin-config-schema.types.js";
import type { PluginKind } from "./plugin-kind.types.js";
import type {
  MangabaClawPluginReloadRegistration,
  MangabaClawPluginSecurityAuditCollector,
} from "./plugin-registration.types.js";
import type { MangabaClawPluginNodeHostCommand } from "./types.node-host.js";

/** Module-level plugin definition loaded from a native plugin entry file. */
export type MangabaClawPluginDefinition = {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  /**
   * @deprecated Declare exclusive plugin kind in `mangabaclaw.plugin.json` via
   * manifest `kind`. Runtime-exported `kind` is kept as a compatibility
   * fallback for older plugins and may require loading plugin runtime on
   * metadata-only command paths.
   */
  kind?: PluginKind | PluginKind[];
  configSchema?: MangabaClawPluginConfigSchema;
  reload?: MangabaClawPluginReloadRegistration;
  nodeHostCommands?: MangabaClawPluginNodeHostCommand[];
  securityAuditCollectors?: MangabaClawPluginSecurityAuditCollector[];
  register?: (api: MangabaClawPluginApi) => void;
};

export type MangabaClawPluginModule = MangabaClawPluginDefinition | ((api: MangabaClawPluginApi) => void);
