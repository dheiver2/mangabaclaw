import Foundation
import MangabaClawKit
import MangabaClawProtocol

public enum MangabaClawChatSessionKey {
    public static func agentID(from sessionKey: String?) -> String? {
        let parts = (sessionKey ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count >= 3, parts[0].lowercased() == "agent" else { return nil }
        let agentID = String(parts[1]).trimmingCharacters(in: .whitespacesAndNewlines)
        return agentID.isEmpty ? nil : agentID
    }
}

/// Canonical gateway payload mapping shared by the native Apple chat transports.
public enum MangabaClawChatGatewayPayloadCodec {
    private struct AgentWaitResponse: Decodable {
        var status: String?
        var endedAt: Double?
        var error: String?
        var stopReason: String?
        var livenessState: String?
        var yielded: Bool?
        var pendingError: Bool?
        var timeoutPhase: String?
        var providerStarted: Bool?
        var aborted: Bool?
    }

    public static func decodeAgentWaitObservation(_ data: Data) throws -> MangabaClawChatRunObservation {
        let decoded = try JSONDecoder().decode(AgentWaitResponse.self, from: data)
        return MangabaClawChatRunObservation.fromWaitResponse(
            status: decoded.status,
            endedAt: decoded.endedAt,
            error: decoded.error,
            stopReason: decoded.stopReason,
            livenessState: decoded.livenessState,
            yielded: decoded.yielded,
            pendingError: decoded.pendingError,
            timeoutPhase: decoded.timeoutPhase,
            providerStarted: decoded.providerStarted,
            aborted: decoded.aborted)
    }

    public static func decodeModelChoices(_ data: Data) throws -> [MangabaClawChatModelChoice] {
        let decoded = try JSONDecoder().decode(ModelsListResult.self, from: data)
        return decoded.models.map(self.modelChoice)
    }

    public static func decodeSessionRoutingIdentity(_ data: Data) throws -> MangabaClawChatSessionRoutingIdentity {
        let decoded = try JSONDecoder().decode(AgentsListResult.self, from: data)
        guard let identity = MangabaClawChatSessionRoutingIdentity(
            scope: decoded.scope.value as? String,
            mainSessionKey: decoded.mainkey,
            defaultAgentID: decoded.defaultid)
        else { throw CancellationError() }
        return identity
    }

    public static func modelChoice(_ model: ModelChoice) -> MangabaClawChatModelChoice {
        let name = model.name.trimmingCharacters(in: .whitespacesAndNewlines)
        return MangabaClawChatModelChoice(
            modelID: model.id,
            name: name.isEmpty ? model.id : model.name,
            provider: model.provider,
            contextWindow: model.contextwindow,
            reasoning: model.reasoning)
    }

    public static func commandChoice(_ entry: CommandEntry) -> MangabaClawChatCommandChoice {
        let sourceValue = (entry.source.value as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let source: MangabaClawChatCommandChoice.Source = switch sourceValue {
        case "native":
            .command
        case "skill":
            .skill
        case "plugin":
            .plugin
        default:
            .unknown
        }
        let aliases = (entry.textaliases ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let id = [
            source.rawValue,
            entry.name.trimmingCharacters(in: .whitespacesAndNewlines),
            aliases.first ?? "",
        ].joined(separator: ":")
        return MangabaClawChatCommandChoice(
            id: id,
            name: entry.name,
            textAliases: aliases,
            description: entry.description,
            source: source,
            acceptsArgs: entry.acceptsargs)
    }

    public static func event(from frame: EventFrame) -> MangabaClawChatTransportEvent? {
        switch frame.event {
        case "tick":
            return .tick
        case "sessions.changed":
            guard let payload = frame.payload,
                  let change = try? GatewayPayloadDecoding.decode(
                      payload,
                      as: MangabaClawChatSessionsChangedEvent.self)
            else { return nil }
            return .sessionsChanged(change)
        case "session.observer":
            guard let payload = frame.payload,
                  let digest = try? GatewayPayloadDecoding.decode(
                      payload,
                      as: SessionObserverDigest.self)
            else { return nil }
            return .sessionObserver(digest)
        case "seqGap":
            return .seqGap
        case "health":
            guard let payload = frame.payload else { return nil }
            let ok = (try? GatewayPayloadDecoding.decode(
                payload,
                as: MangabaClawGatewayHealthOK.self))?.ok ?? true
            return .health(ok: ok)
        case "chat":
            guard let payload = frame.payload,
                  let chat = try? GatewayPayloadDecoding.decode(
                      payload,
                      as: MangabaClawChatEventPayload.self)
            else { return nil }
            return .chat(chat)
        case "session.message":
            guard let payload = frame.payload,
                  let message = try? GatewayPayloadDecoding.decode(
                      payload,
                      as: MangabaClawSessionMessageEventPayload.self)
            else { return nil }
            if var canonicalMessage = message.message,
               canonicalMessage.transcriptMessageID?
                   .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false,
                   let messageID = message.messageId?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !messageID.isEmpty
            {
                // Live events carry durable transcript identity on their envelope.
                // Preserve it on the row so history cannot replay the same message.
                canonicalMessage.transcriptMessageID = messageID
                return .sessionMessage(MangabaClawSessionMessageEventPayload(
                    sessionKey: message.sessionKey,
                    agentId: message.agentId,
                    message: canonicalMessage,
                    messageId: message.messageId,
                    messageSeq: message.messageSeq,
                    hasActiveRun: message.hasActiveRun,
                    activeRunIds: message.activeRunIds,
                    activeRunIdsPresent: message.activeRunIdsPresent))
            }
            return .sessionMessage(message)
        case "agent":
            guard let payload = frame.payload,
                  let agent = try? GatewayPayloadDecoding.decode(
                      payload,
                      as: MangabaClawAgentEventPayload.self)
            else { return nil }
            return .agent(agent)
        case "progressCard.changed":
            guard let payload = frame.payload,
                  let event = try? GatewayPayloadDecoding.decode(
                      payload,
                      as: ProgressCardChangedEvent.self)
            else { return nil }
            return .progressCardChanged(event)
        default:
            return self.secondaryEvent(from: frame)
        }
    }

    private static func secondaryEvent(from frame: EventFrame) -> MangabaClawChatTransportEvent? {
        guard let payload = frame.payload else { return nil }
        switch frame.event {
        case "task":
            return (try? GatewayPayloadDecoding.decode(payload, as: MangabaClawChatTaskEvent.self))
                .map(MangabaClawChatTransportEvent.task)
        case "question.requested":
            return (try? GatewayPayloadDecoding.decode(payload, as: QuestionRecord.self))
                .map(MangabaClawChatTransportEvent.questionRequested)
        case "question.resolved":
            return (try? GatewayPayloadDecoding.decode(payload, as: MangabaClawQuestionResolvedEvent.self))
                .map(MangabaClawChatTransportEvent.questionResolved)
        default:
            return nil
        }
    }
}
