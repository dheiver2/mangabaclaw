import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { Result } from "@mangabaclaw/normalization-core/result";
import type { Command } from "commander";
import type { MessageReceipt } from "../channels/message/types.js";
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import type {
  DiagnosticEventPrivateData,
  DiagnosticEventInput,
  DiagnosticEventMetadata,
  DiagnosticEventPayload,
} from "../infra/diagnostic-events.js";
import type { DiagnosticTracePropagationBridge as DiagnosticTracePropagationBridgeContract } from "../infra/diagnostic-trace-propagation.js";
import type { SecurityAuditFinding } from "../security/audit.types.js";
import type { DeliveryContext } from "../utils/delivery-context.types.js";
import type { PluginLogger } from "./logger-types.js";

type ChannelPlugin = import("../channels/plugins/types.plugin.js").ChannelPlugin;
type DiagnosticTracePropagationBridge = DiagnosticTracePropagationBridgeContract<
  DiagnosticEventPayload,
  DiagnosticEventMetadata
>;

type PluginInteractiveHandlerResult = {
  handled?: boolean;
} | void;

export type PluginInteractiveRegistration<
  TContext = unknown,
  TChannel extends string = string,
  TResult = PluginInteractiveHandlerResult,
> = {
  channel: TChannel;
  namespace: string;
  handler: (ctx: TContext) => Promise<TResult> | TResult;
};

export type PluginInteractiveHandlerRegistration = PluginInteractiveRegistration;

export type MangabaClawPluginHttpRouteAuth = "gateway" | "plugin";
export type MangabaClawPluginHttpRouteMatch = "exact" | "prefix";
export type MangabaClawPluginGatewayRuntimeScopeSurface = "write-default" | "trusted-operator";

export type MangabaClawPluginHttpRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean | void> | boolean | void;

export type MangabaClawPluginHttpRouteUpgradeHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => Promise<boolean | void> | boolean | void;

export type MangabaClawPluginHttpRouteParams = {
  path: string;
  handler: MangabaClawPluginHttpRouteHandler;
  handleUpgrade?: MangabaClawPluginHttpRouteUpgradeHandler;
  auth: MangabaClawPluginHttpRouteAuth;
  match?: MangabaClawPluginHttpRouteMatch;
  gatewayRuntimeScopeSurface?: MangabaClawPluginGatewayRuntimeScopeSurface;
  nodeCapability?: {
    surface: string;
    ttlMs?: number;
  };
  replaceExisting?: boolean;
};

export type MangabaClawPluginHostedMediaResolver = (
  mediaUrl: string,
) => string | null | undefined | Promise<string | null | undefined>;

export type WidgetPresenterContext = Readonly<{
  messageChannel?: string;
  accountId?: string;
  deliveryContext?: Readonly<DeliveryContext>;
  nativeChannelId?: string;
  currentChannelId?: string;
  currentMessagingTarget?: string;
  sessionKey?: string;
}>;

export type WidgetPresenterDocument = Readonly<{
  kind: "html";
  html: string;
  hostedUrl?: string;
}>;

export type WidgetPresentationError =
  | { code: "no_eligible_node"; message: string }
  | { code: "node_error"; message: string; nodeId?: string }
  | { code: "unavailable"; message: string }
  | { code: "presentation_error"; message: string };

export type WidgetPresentationSuccess =
  | { kind: "node"; nodeId: string; nodeName?: string }
  | { kind: "message"; receipt: MessageReceipt };

type WidgetPresenterBase = {
  description: string;
  availability: (
    context: WidgetPresenterContext,
  ) => Promise<Result<{ available: true }, WidgetPresentationError>>;
  present: (params: {
    document: WidgetPresenterDocument;
    title: string;
    context: WidgetPresenterContext;
  }) => Promise<Result<WidgetPresentationSuccess, WidgetPresentationError>>;
};

export type WidgetPresenter = WidgetPresenterBase &
  (
    | {
        target: "node_panel";
        match?: never;
        capabilities?: never;
      }
    | {
        target: "current_channel";
        match: (context: WidgetPresenterContext) => boolean;
        capabilities: Readonly<{
          sourceKinds: readonly string[];
          maxSourceBytes?: number;
        }>;
      }
  );

export type MangabaClawPluginCliContext = {
  /**
   * Command object where this plugin should register its commands.
   *
   * For root CLI registrations this is the root `mangabaclaw` program. For nested
   * registrations it is the resolved parent command from `parentPath`.
   */
  program: Command;
  parentPath: readonly string[];
  config: MangabaClawConfig;
  workspaceDir?: string;
  logger: PluginLogger;
};

export type MangabaClawPluginCliRegistrar = (ctx: MangabaClawPluginCliContext) => void | Promise<void>;

/**
 * Top-level CLI metadata for plugin-owned commands.
 *
 * Descriptors are the parse-time contract for lazy plugin CLI registration.
 * If you want MangabaClaw to keep a plugin command lazy-loaded while still
 * advertising it at the root CLI level, provide descriptors that cover every
 * top-level command root registered by that plugin CLI surface.
 */
type MangabaClawPluginCliCommandDescriptor = {
  name: string;
  description: string;
  hasSubcommands: boolean;
};

/** Root-command metadata that is available before a plugin registrar is activated. */
export type MangabaClawPluginCliRootCommandDescriptor = MangabaClawPluginCliCommandDescriptor & {
  machineOutput?: (params: { argv: readonly string[]; stdoutIsTTY: boolean }) => boolean;
};

type MangabaClawPluginRootCliRegistrationOptions = {
  /** Omit or pass an empty path for root commands. */
  parentPath?: readonly [];
  commands?: readonly string[];
  descriptors?: readonly MangabaClawPluginCliRootCommandDescriptor[];
};

/** Backward-compatible registration shape for dynamic root or nested paths. */
type MangabaClawPluginLegacyCliRegistrationOptions = {
  parentPath?: readonly string[];
  commands?: readonly string[];
  descriptors?: readonly MangabaClawPluginCliCommandDescriptor[];
};

export type MangabaClawPluginCliRegistrationOptions =
  | MangabaClawPluginRootCliRegistrationOptions
  | MangabaClawPluginLegacyCliRegistrationOptions;

export type MangabaClawPluginNodeCliFeatureOptions = {
  /** Explicit node feature command names owned under `mangabaclaw nodes`. */
  commands?: string[];
  /**
   * Parse-time command descriptors for lazy node feature CLI registration.
   *
   * Descriptors are registered under `mangabaclaw nodes`, so a descriptor named
   * `"camera"` exposes `mangabaclaw nodes camera`.
   */
  descriptors?: MangabaClawPluginCliCommandDescriptor[];
};

export type MangabaClawPluginReloadRegistration = {
  restartPrefixes?: string[];
  hotPrefixes?: string[];
  noopPrefixes?: string[];
};

export type {
  MangabaClawPluginNodeHostCommand,
  MangabaClawPluginNodeHostCommandAvailabilityContext,
  MangabaClawPluginNodeHostCommandIo,
} from "./types.node-host.js";

export type MangabaClawPluginNodeInvokeTransportResult =
  | {
      ok: true;
      payload?: unknown;
      payloadJSON?: string | null;
    }
  | {
      ok: false;
      code?: string;
      message: string;
      details?: Record<string, unknown>;
    };

type MangabaClawPluginNodeInvokeApprovalDecision = "allow-once" | "allow-always" | "deny";

type MangabaClawPluginNodeInvokePolicyApprovalRuntime = {
  request: (input: {
    title: string;
    description: string;
    severity?: "info" | "warning" | "critical";
    toolName?: string;
    toolCallId?: string;
    agentId?: string;
    sessionKey?: string;
    timeoutMs?: number;
  }) => Promise<{
    id?: string;
    decision?: MangabaClawPluginNodeInvokeApprovalDecision | null;
  }>;
};

export type MangabaClawPluginNodeInvokePolicyContext = {
  nodeId: string;
  command: string;
  params: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;
  config: MangabaClawConfig;
  pluginConfig?: Record<string, unknown>;
  node?: {
    nodeId: string;
    displayName?: string;
    platform?: string;
    deviceFamily?: string;
    commands?: string[];
  };
  client?: {
    connId?: string;
    scopes?: string[];
  } | null;
  risk?: {
    level: "ordinary" | "high";
    /** Stable, content-free family name; never include user or action arguments. */
    family: string;
  };
  approvals?: MangabaClawPluginNodeInvokePolicyApprovalRuntime;
  invokeNode: (input?: {
    params?: unknown;
    timeoutMs?: number;
    idempotencyKey?: string;
  }) => Promise<MangabaClawPluginNodeInvokeTransportResult>;
};

export type MangabaClawPluginNodeInvokePolicyResult =
  | {
      ok: true;
      payload?: unknown;
      payloadJSON?: string | null;
    }
  | {
      ok: false;
      message: string;
      code?: string;
      details?: Record<string, unknown>;
      unavailable?: boolean;
    };

export type MangabaClawPluginNodeInvokePolicy = {
  commands: string[];
  /**
   * Platforms where these node-handled commands should be allowlisted by default.
   * Omit for commands that require explicit `gateway.nodes.commands.allow`.
   */
  defaultPlatforms?: Array<"ios" | "android" | "macos" | "windows" | "linux" | "unknown">;
  /**
   * Dangerous policy commands are filtered out of default allowlists unless
   * explicitly allowed by config.
   */
  dangerous?: boolean;
  /**
   * iOS foreground-restricted commands should be queued for foreground delivery
   * when an iOS node reports BACKGROUND_UNAVAILABLE.
   */
  foregroundRestrictedOnIos?: boolean;
  /**
   * Classify exact command arguments before the policy handler or node transport runs.
   * Throwing rejects the invocation before dispatch.
   */
  classifyRisk?: (
    ctx: Pick<MangabaClawPluginNodeInvokePolicyContext, "command" | "params">,
  ) => NonNullable<MangabaClawPluginNodeInvokePolicyContext["risk"]>;
  handle: (
    ctx: MangabaClawPluginNodeInvokePolicyContext,
  ) => Promise<MangabaClawPluginNodeInvokePolicyResult> | MangabaClawPluginNodeInvokePolicyResult;
};

export type MangabaClawPluginSecurityAuditContext = {
  config: MangabaClawConfig;
  sourceConfig: MangabaClawConfig;
  env: NodeJS.ProcessEnv;
  stateDir: string;
  configPath: string;
};

export type MangabaClawPluginSecurityAuditCollector = (
  ctx: MangabaClawPluginSecurityAuditContext,
) => SecurityAuditFinding[] | Promise<SecurityAuditFinding[]>;

export type MangabaClawGatewayDiscoveryAdvertiseContext = {
  machineDisplayName: string;
  gatewayPort: number;
  gatewayTlsEnabled: boolean;
  gatewayTlsFingerprintSha256?: string;
  gatewayDirectReachable: boolean;
  tailnetDns?: string;
  sshPort?: number;
  cliPath?: string;
  minimal: boolean;
};

export type MangabaClawGatewayDiscoveryService = {
  id: string;
  advertise: (
    ctx: MangabaClawGatewayDiscoveryAdvertiseContext,
  ) => void | Promise<void | { stop?: () => void | Promise<void> }>;
};

/** Context passed to long-lived plugin services. */
export type MangabaClawPluginServiceHealth = {
  reportFailure: (error: unknown) => void;
  clearFailure: () => void;
};

export type MangabaClawPluginServiceContext = {
  config: MangabaClawConfig;
  workspaceDir?: string;
  stateDir: string;
  logger: PluginLogger;
  serviceHealth?: MangabaClawPluginServiceHealth;
  gatewayEvents?: import("./gateway-events.js").MangabaClawPluginGatewayEvents;
  startupTrace?: {
    detail?: (name: string, metrics: ReadonlyArray<readonly [string, number | string]>) => void;
    measure: <T>(name: string, run: () => T | Promise<T>) => Promise<T>;
  };
  internalDiagnostics?: {
    emit: (event: DiagnosticEventInput, privateData?: DiagnosticEventPrivateData) => void;
    onEvent: (
      listener: (
        event: DiagnosticEventPayload,
        metadata: DiagnosticEventMetadata,
        privateData: DiagnosticEventPrivateData,
      ) => void,
    ) => () => void;
    registerTracePropagationBridge?: (bridge: DiagnosticTracePropagationBridge) => () => void;
  };
};

/** Background service registered by a plugin during `register(api)`. */
export type MangabaClawPluginService = {
  id: string;
  start: (ctx: MangabaClawPluginServiceContext) => void | Promise<void>;
  stop?: (ctx: MangabaClawPluginServiceContext) => void | Promise<void>;
};

export type MangabaClawPluginChannelRegistration = {
  plugin: ChannelPlugin;
};

/**
 * Public label exposed to plugin `register(api)` calls.
 *
 * Keep this as a compatibility signal for plugin authors. Loader internals
 * should derive explicit capability booleans from the mode instead of branching
 * on raw strings throughout the code path.
 *
 * - `full`: live runtime activation; long-lived side effects may start.
 * - `discovery`: read-only capability discovery; skip sockets/workers/clients.
 * - `tool-discovery`: capability discovery for executable tools; skip channel runtime hydration.
 * - `setup-only`: lightweight channel setup entry only.
 * - `setup-runtime`: setup flow that also needs the runtime channel entry.
 * - `cli-metadata`: CLI command metadata collection.
 */
export type PluginRegistrationMode =
  | "full"
  | "discovery"
  | "tool-discovery"
  | "setup-only"
  | "setup-runtime"
  | "cli-metadata";
