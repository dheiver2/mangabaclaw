// Builds plugin API objects from config, registries, and runtime helpers.
import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import { attachPluginApiFacades, type MangabaClawPluginApiWithoutFacades } from "./api-facades.js";
import type { PluginRuntime } from "./runtime/types.js";
import type { MangabaClawPluginApi, PluginLogger } from "./types.js";

type BuildPluginApiParams = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  rootDir?: string;
  registrationMode: MangabaClawPluginApi["registrationMode"];
  config: MangabaClawConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;
  resolvePath: (input: string) => string;
  handlers?: Partial<
    Pick<
      MangabaClawPluginApi,
      | "registerTool"
      | "registerHook"
      | "registerHttpRoute"
      | "registerHostedMediaResolver"
      | "registerWidgetPresenter"
      | "registerMcpServerConnectionResolver"
      | "registerChannel"
      | "registerGatewayMethod"
      | "registerSessionCatalog"
      | "registerCli"
      | "registerReload"
      | "registerNodeHostCommand"
      | "registerNodeInvokePolicy"
      | "registerSecurityAuditCollector"
      | "registerService"
      | "registerGatewayDiscoveryService"
      | "registerCliBackend"
      | "registerTextTransforms"
      | "registerConfigMigration"
      | "registerMigrationProvider"
      | "registerAutoEnableProbe"
      | "registerProvider"
      | "registerWorkerProvider"
      | "registerModelCatalogProvider"
      | "registerEmbeddingProvider"
      | "registerSpeechProvider"
      | "registerRealtimeTranscriptionProvider"
      | "registerRealtimeVoiceProvider"
      | "registerMediaUnderstandingProvider"
      | "registerTranscriptSourceProvider"
      | "registerImageGenerationProvider"
      | "registerVideoGenerationProvider"
      | "registerMusicGenerationProvider"
      | "registerWebFetchProvider"
      | "registerWebSearchProvider"
      | "registerInteractiveHandler"
      | "onConversationBindingResolved"
      | "registerCommand"
      | "registerContextEngine"
      | "registerCompactionProvider"
      | "registerAgentHarness"
      | "registerCodexAppServerExtensionFactory"
      | "registerAgentToolResultMiddleware"
      | "registerSessionExtension"
      | "enqueueNextTurnInjection"
      | "registerTrustedToolPolicy"
      | "registerToolMetadata"
      | "registerControlUiDescriptor"
      | "registerBoardWidgetContentKind"
      | "registerRuntimeLifecycle"
      | "registerAgentEventSubscription"
      | "emitAgentEvent"
      | "setRunContext"
      | "getRunContext"
      | "clearRunContext"
      | "registerSessionSchedulerJob"
      | "registerSessionAction"
      | "sendSessionAttachment"
      | "scheduleSessionTurn"
      | "unscheduleSessionTurnsByTag"
      | "registerDetachedTaskRuntime"
      | "registerMemoryCapability"
      | "registerMemoryPromptSupplement"
      | "registerMemoryPromptPreparation"
      | "registerMemoryCorpusSupplement"
      | "on"
    >
  >;
};

const noopRegisterTool: MangabaClawPluginApi["registerTool"] = () => {};
const noopRegisterHook: MangabaClawPluginApi["registerHook"] = () => {};
const noopRegisterHttpRoute: MangabaClawPluginApi["registerHttpRoute"] = () => {};
const noopRegisterHostedMediaResolver: MangabaClawPluginApi["registerHostedMediaResolver"] = () => {};
const noopRegisterWidgetPresenter: MangabaClawPluginApi["registerWidgetPresenter"] = () => {};
const noopRegisterMcpServerConnectionResolver: MangabaClawPluginApi["registerMcpServerConnectionResolver"] =
  () => {};
const noopRegisterChannel: MangabaClawPluginApi["registerChannel"] = () => {};
const noopRegisterGatewayMethod: MangabaClawPluginApi["registerGatewayMethod"] = () => {};
const noopRegisterSessionCatalog: MangabaClawPluginApi["registerSessionCatalog"] = () => {};
const noopRegisterCli: MangabaClawPluginApi["registerCli"] = () => {};
const noopRegisterReload: MangabaClawPluginApi["registerReload"] = () => {};
const noopRegisterNodeHostCommand: MangabaClawPluginApi["registerNodeHostCommand"] = () => {};
const noopRegisterNodeInvokePolicy: MangabaClawPluginApi["registerNodeInvokePolicy"] = () => {};
const noopRegisterSecurityAuditCollector: MangabaClawPluginApi["registerSecurityAuditCollector"] =
  () => {};
const noopRegisterService: MangabaClawPluginApi["registerService"] = () => {};
const noopRegisterGatewayDiscoveryService: MangabaClawPluginApi["registerGatewayDiscoveryService"] =
  () => {};
const noopRegisterCliBackend: MangabaClawPluginApi["registerCliBackend"] = () => {};
const noopRegisterTextTransforms: MangabaClawPluginApi["registerTextTransforms"] = () => {};
const noopRegisterConfigMigration: MangabaClawPluginApi["registerConfigMigration"] = () => {};
const noopRegisterMigrationProvider: MangabaClawPluginApi["registerMigrationProvider"] = () => {};
const noopRegisterAutoEnableProbe: MangabaClawPluginApi["registerAutoEnableProbe"] = () => {};
const noopRegisterProvider: MangabaClawPluginApi["registerProvider"] = () => {};
const noopRegisterWorkerProvider: MangabaClawPluginApi["registerWorkerProvider"] = () => {};
const noopRegisterModelCatalogProvider: MangabaClawPluginApi["registerModelCatalogProvider"] =
  () => {};
const noopRegisterEmbeddingProvider: MangabaClawPluginApi["registerEmbeddingProvider"] = () => {};
const noopRegisterSpeechProvider: MangabaClawPluginApi["registerSpeechProvider"] = () => {};
const noopRegisterRealtimeTranscriptionProvider: MangabaClawPluginApi["registerRealtimeTranscriptionProvider"] =
  () => {};
const noopRegisterRealtimeVoiceProvider: MangabaClawPluginApi["registerRealtimeVoiceProvider"] =
  () => {};
const noopRegisterMediaUnderstandingProvider: MangabaClawPluginApi["registerMediaUnderstandingProvider"] =
  () => {};
const noopRegisterTranscriptsSourceProvider: MangabaClawPluginApi["registerTranscriptSourceProvider"] =
  () => {};
const noopRegisterImageGenerationProvider: MangabaClawPluginApi["registerImageGenerationProvider"] =
  () => {};
const noopRegisterVideoGenerationProvider: MangabaClawPluginApi["registerVideoGenerationProvider"] =
  () => {};
const noopRegisterMusicGenerationProvider: MangabaClawPluginApi["registerMusicGenerationProvider"] =
  () => {};
const noopRegisterWebFetchProvider: MangabaClawPluginApi["registerWebFetchProvider"] = () => {};
const noopRegisterWebSearchProvider: MangabaClawPluginApi["registerWebSearchProvider"] = () => {};
const noopRegisterInteractiveHandler: MangabaClawPluginApi["registerInteractiveHandler"] = () => {};
const noopOnConversationBindingResolved: MangabaClawPluginApi["onConversationBindingResolved"] =
  () => {};
const noopRegisterCommand: MangabaClawPluginApi["registerCommand"] = () => {};
const noopRegisterContextEngine: MangabaClawPluginApi["registerContextEngine"] = () => {};
const noopRegisterCompactionProvider: MangabaClawPluginApi["registerCompactionProvider"] = () => {};
const noopRegisterAgentHarness: MangabaClawPluginApi["registerAgentHarness"] = () => {};
const noopRegisterCodexAppServerExtensionFactory: MangabaClawPluginApi["registerCodexAppServerExtensionFactory"] =
  () => {};
const noopRegisterAgentToolResultMiddleware: MangabaClawPluginApi["registerAgentToolResultMiddleware"] =
  () => {};
const noopRegisterSessionExtension: MangabaClawPluginApi["registerSessionExtension"] = () => {};
const noopEnqueueNextTurnInjection: MangabaClawPluginApi["enqueueNextTurnInjection"] = async (
  injection,
) => ({ enqueued: false, id: "", sessionKey: injection.sessionKey });
const noopRegisterTrustedToolPolicy: MangabaClawPluginApi["registerTrustedToolPolicy"] = () => {};
const noopRegisterToolMetadata: MangabaClawPluginApi["registerToolMetadata"] = () => {};
const noopRegisterControlUiDescriptor: MangabaClawPluginApi["registerControlUiDescriptor"] = () => {};
const noopRegisterBoardWidgetContentKind: MangabaClawPluginApi["registerBoardWidgetContentKind"] =
  () => {};
const noopRegisterRuntimeLifecycle: MangabaClawPluginApi["registerRuntimeLifecycle"] = () => {};
const noopRegisterAgentEventSubscription: MangabaClawPluginApi["registerAgentEventSubscription"] =
  () => {};
const noopEmitAgentEvent: MangabaClawPluginApi["emitAgentEvent"] = () => ({
  emitted: false,
  reason: "not wired",
});
const noopSetRunContext: MangabaClawPluginApi["setRunContext"] = () => false;
const noopGetRunContext: MangabaClawPluginApi["getRunContext"] = () => undefined;
const noopClearRunContext: MangabaClawPluginApi["clearRunContext"] = () => {};
const noopRegisterSessionSchedulerJob: MangabaClawPluginApi["registerSessionSchedulerJob"] = () =>
  undefined;
const noopRegisterSessionAction: MangabaClawPluginApi["registerSessionAction"] = () => {};
const noopSendSessionAttachment: MangabaClawPluginApi["sendSessionAttachment"] = async () => ({
  ok: false,
  error: "not wired",
});
const noopScheduleSessionTurn: MangabaClawPluginApi["scheduleSessionTurn"] = async () => undefined;
const noopUnscheduleSessionTurnsByTag: MangabaClawPluginApi["unscheduleSessionTurnsByTag"] =
  async () => ({ removed: 0, failed: 0 });
const noopRegisterDetachedTaskRuntime: MangabaClawPluginApi["registerDetachedTaskRuntime"] = () => {};
const noopRegisterMemoryCapability: MangabaClawPluginApi["registerMemoryCapability"] = () => {};
const noopRegisterMemoryPromptSupplement: MangabaClawPluginApi["registerMemoryPromptSupplement"] =
  () => {};
const noopRegisterMemoryPromptPreparation: MangabaClawPluginApi["registerMemoryPromptPreparation"] =
  () => {};
const noopRegisterMemoryCorpusSupplement: MangabaClawPluginApi["registerMemoryCorpusSupplement"] =
  () => {};
const noopOn: MangabaClawPluginApi["on"] = () => {};

export function buildPluginApi(params: BuildPluginApiParams): MangabaClawPluginApi {
  const handlers = params.handlers ?? {};
  const registerCli = handlers.registerCli ?? noopRegisterCli;
  const api: MangabaClawPluginApiWithoutFacades = {
    id: params.id,
    name: params.name,
    version: params.version,
    description: params.description,
    source: params.source,
    rootDir: params.rootDir,
    registrationMode: params.registrationMode,
    config: params.config,
    pluginConfig: params.pluginConfig,
    runtime: params.runtime,
    logger: params.logger,
    registerTool: handlers.registerTool ?? noopRegisterTool,
    registerHook: handlers.registerHook ?? noopRegisterHook,
    registerHttpRoute: handlers.registerHttpRoute ?? noopRegisterHttpRoute,
    registerHostedMediaResolver:
      handlers.registerHostedMediaResolver ?? noopRegisterHostedMediaResolver,
    registerWidgetPresenter: handlers.registerWidgetPresenter ?? noopRegisterWidgetPresenter,
    registerMcpServerConnectionResolver:
      handlers.registerMcpServerConnectionResolver ?? noopRegisterMcpServerConnectionResolver,
    registerChannel: handlers.registerChannel ?? noopRegisterChannel,
    registerGatewayMethod: handlers.registerGatewayMethod ?? noopRegisterGatewayMethod,
    registerSessionCatalog: handlers.registerSessionCatalog ?? noopRegisterSessionCatalog,
    registerCli,
    registerNodeCliFeature: (registrar, opts) =>
      registerCli(registrar, {
        ...opts,
        parentPath: ["nodes"],
      }),
    registerReload: handlers.registerReload ?? noopRegisterReload,
    registerNodeHostCommand: handlers.registerNodeHostCommand ?? noopRegisterNodeHostCommand,
    registerNodeInvokePolicy: handlers.registerNodeInvokePolicy ?? noopRegisterNodeInvokePolicy,
    registerSecurityAuditCollector:
      handlers.registerSecurityAuditCollector ?? noopRegisterSecurityAuditCollector,
    registerService: handlers.registerService ?? noopRegisterService,
    registerGatewayDiscoveryService:
      handlers.registerGatewayDiscoveryService ?? noopRegisterGatewayDiscoveryService,
    registerCliBackend: handlers.registerCliBackend ?? noopRegisterCliBackend,
    registerTextTransforms: handlers.registerTextTransforms ?? noopRegisterTextTransforms,
    registerConfigMigration: handlers.registerConfigMigration ?? noopRegisterConfigMigration,
    registerMigrationProvider: handlers.registerMigrationProvider ?? noopRegisterMigrationProvider,
    registerAutoEnableProbe: handlers.registerAutoEnableProbe ?? noopRegisterAutoEnableProbe,
    registerProvider: handlers.registerProvider ?? noopRegisterProvider,
    registerWorkerProvider: handlers.registerWorkerProvider ?? noopRegisterWorkerProvider,
    registerModelCatalogProvider:
      handlers.registerModelCatalogProvider ?? noopRegisterModelCatalogProvider,
    registerEmbeddingProvider: handlers.registerEmbeddingProvider ?? noopRegisterEmbeddingProvider,
    registerSpeechProvider: handlers.registerSpeechProvider ?? noopRegisterSpeechProvider,
    registerRealtimeTranscriptionProvider:
      handlers.registerRealtimeTranscriptionProvider ?? noopRegisterRealtimeTranscriptionProvider,
    registerRealtimeVoiceProvider:
      handlers.registerRealtimeVoiceProvider ?? noopRegisterRealtimeVoiceProvider,
    registerMediaUnderstandingProvider:
      handlers.registerMediaUnderstandingProvider ?? noopRegisterMediaUnderstandingProvider,
    registerTranscriptSourceProvider:
      handlers.registerTranscriptSourceProvider ?? noopRegisterTranscriptsSourceProvider,
    registerImageGenerationProvider:
      handlers.registerImageGenerationProvider ?? noopRegisterImageGenerationProvider,
    registerVideoGenerationProvider:
      handlers.registerVideoGenerationProvider ?? noopRegisterVideoGenerationProvider,
    registerMusicGenerationProvider:
      handlers.registerMusicGenerationProvider ?? noopRegisterMusicGenerationProvider,
    registerWebFetchProvider: handlers.registerWebFetchProvider ?? noopRegisterWebFetchProvider,
    registerWebSearchProvider: handlers.registerWebSearchProvider ?? noopRegisterWebSearchProvider,
    registerInteractiveHandler:
      handlers.registerInteractiveHandler ?? noopRegisterInteractiveHandler,
    onConversationBindingResolved:
      handlers.onConversationBindingResolved ?? noopOnConversationBindingResolved,
    registerCommand: handlers.registerCommand ?? noopRegisterCommand,
    registerContextEngine: handlers.registerContextEngine ?? noopRegisterContextEngine,
    registerCompactionProvider:
      handlers.registerCompactionProvider ?? noopRegisterCompactionProvider,
    registerAgentHarness: handlers.registerAgentHarness ?? noopRegisterAgentHarness,
    registerCodexAppServerExtensionFactory:
      handlers.registerCodexAppServerExtensionFactory ?? noopRegisterCodexAppServerExtensionFactory,
    registerAgentToolResultMiddleware:
      handlers.registerAgentToolResultMiddleware ?? noopRegisterAgentToolResultMiddleware,
    registerSessionExtension: handlers.registerSessionExtension ?? noopRegisterSessionExtension,
    enqueueNextTurnInjection: handlers.enqueueNextTurnInjection ?? noopEnqueueNextTurnInjection,
    registerTrustedToolPolicy: handlers.registerTrustedToolPolicy ?? noopRegisterTrustedToolPolicy,
    registerToolMetadata: handlers.registerToolMetadata ?? noopRegisterToolMetadata,
    registerControlUiDescriptor:
      handlers.registerControlUiDescriptor ?? noopRegisterControlUiDescriptor,
    registerBoardWidgetContentKind:
      handlers.registerBoardWidgetContentKind ?? noopRegisterBoardWidgetContentKind,
    registerRuntimeLifecycle: handlers.registerRuntimeLifecycle ?? noopRegisterRuntimeLifecycle,
    registerAgentEventSubscription:
      handlers.registerAgentEventSubscription ?? noopRegisterAgentEventSubscription,
    emitAgentEvent: handlers.emitAgentEvent ?? noopEmitAgentEvent,
    setRunContext: handlers.setRunContext ?? noopSetRunContext,
    getRunContext: handlers.getRunContext ?? noopGetRunContext,
    clearRunContext: handlers.clearRunContext ?? noopClearRunContext,
    registerSessionSchedulerJob:
      handlers.registerSessionSchedulerJob ?? noopRegisterSessionSchedulerJob,
    registerSessionAction: handlers.registerSessionAction ?? noopRegisterSessionAction,
    sendSessionAttachment: handlers.sendSessionAttachment ?? noopSendSessionAttachment,
    scheduleSessionTurn: handlers.scheduleSessionTurn ?? noopScheduleSessionTurn,
    unscheduleSessionTurnsByTag:
      handlers.unscheduleSessionTurnsByTag ?? noopUnscheduleSessionTurnsByTag,
    registerDetachedTaskRuntime:
      handlers.registerDetachedTaskRuntime ?? noopRegisterDetachedTaskRuntime,
    registerMemoryCapability: handlers.registerMemoryCapability ?? noopRegisterMemoryCapability,
    registerMemoryPromptSupplement:
      handlers.registerMemoryPromptSupplement ?? noopRegisterMemoryPromptSupplement,
    registerMemoryPromptPreparation:
      handlers.registerMemoryPromptPreparation ?? noopRegisterMemoryPromptPreparation,
    registerMemoryCorpusSupplement:
      handlers.registerMemoryCorpusSupplement ?? noopRegisterMemoryCorpusSupplement,
    resolvePath: params.resolvePath,
    on: handlers.on ?? noopOn,
  };
  return attachPluginApiFacades(api);
}
