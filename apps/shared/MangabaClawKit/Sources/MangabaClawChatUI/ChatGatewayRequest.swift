import Foundation
import MangabaClawKit
import MangabaClawProtocol

public struct MangabaClawChatGatewayRequest: Sendable, Equatable {
    public let method: String
    public let params: [String: AnyCodable]
    public let timeoutMs: Double

    public init(method: String, params: [String: AnyCodable] = [:], timeoutMs: Double) {
        self.method = method
        self.params = params
        self.timeoutMs = timeoutMs
    }
}

public enum MangabaClawChatSessionTargetPolicy: Sendable {
    case preserveBareKeys
    case scopeBareKeysToSelectedAgent
}

public struct MangabaClawChatSessionTarget: Sendable, Equatable {
    public let sessionKey: String
    public let agentID: String?

    public init(sessionKey: String, agentID: String?) {
        self.sessionKey = sessionKey
        self.agentID = agentID
    }

    public static func resolve(
        _ rawSessionKey: String,
        selectedAgentID: String?,
        overrideAgentID: String? = nil,
        policy: MangabaClawChatSessionTargetPolicy) -> Self
    {
        let sessionKey = rawSessionKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let selected = self.normalizedAgentID(selectedAgentID)
        let override = self.normalizedAgentID(overrideAgentID)

        if MangabaClawChatSessionKey.agentID(from: sessionKey) != nil {
            return Self(sessionKey: sessionKey, agentID: override)
        }
        let lowercasedKey = sessionKey.lowercased()
        if lowercasedKey.hasPrefix("agent:") || lowercasedKey == "unknown" {
            return Self(sessionKey: sessionKey, agentID: nil)
        }
        if lowercasedKey == "global" {
            return Self(sessionKey: sessionKey, agentID: override ?? selected)
        }

        switch policy {
        case .preserveBareKeys:
            return Self(sessionKey: sessionKey, agentID: override)
        case .scopeBareKeysToSelectedAgent:
            guard let agentID = override ?? selected else {
                return Self(sessionKey: sessionKey, agentID: nil)
            }
            return Self(sessionKey: "agent:\(agentID):\(sessionKey)", agentID: nil)
        }
    }

    private static func normalizedAgentID(_ agentID: String?) -> String? {
        let normalized = agentID?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized?.isEmpty == false ? normalized : nil
    }
}

public enum MangabaClawChatGatewayRequests {
    private static let defaultTimeoutMs: Double = 15000
    private static let mutationTimeoutMs: Double = 15000
    private static let archiveMutationTimeoutMs: Double = 10 * 60 * 1000
    private static let shortTimeoutMs: Double = 10000
    private static let compactionTimeoutMs: Double = 0

    public static func agentsList(timeoutMs: Double = 15000) -> MangabaClawChatGatewayRequest {
        MangabaClawChatGatewayRequest(method: "agents.list", timeoutMs: timeoutMs)
    }

    public static func modelsList(agentID: String?) -> MangabaClawChatGatewayRequest {
        var params: [String: AnyCodable] = [:]
        self.add(agentID, to: &params, key: "agentId")
        return MangabaClawChatGatewayRequest(
            method: "models.list",
            params: params,
            timeoutMs: self.defaultTimeoutMs)
    }

    public static func artifactDownload(
        sessionKey: String,
        agentID: String?,
        artifactId: String) -> MangabaClawChatGatewayRequest
    {
        var params: [String: AnyCodable] = [
            "sessionKey": AnyCodable(sessionKey),
            "artifactId": AnyCodable(artifactId),
        ]
        self.add(agentID, to: &params, key: "agentId")
        return MangabaClawChatGatewayRequest(
            method: "artifacts.download",
            params: params,
            timeoutMs: self.defaultTimeoutMs)
    }

    public static func chatMetadata(
        sessionKey: String,
        fallbackAgentID: String?) -> MangabaClawChatGatewayRequest
    {
        var params: [String: AnyCodable] = [:]
        self.add(
            MangabaClawChatSessionKey.agentID(from: sessionKey) ?? fallbackAgentID,
            to: &params,
            key: "agentId")
        return MangabaClawChatGatewayRequest(
            method: "chat.metadata",
            params: params,
            timeoutMs: self.defaultTimeoutMs)
    }

    public static func questionList() -> MangabaClawChatGatewayRequest {
        MangabaClawChatGatewayRequest(method: "question.list", timeoutMs: self.defaultTimeoutMs)
    }

    public static func tasksList(
        sessionKey: String,
        agentID: String?,
        limit: Int = 200) -> MangabaClawChatGatewayRequest
    {
        var params: [String: AnyCodable] = [
            "sessionKey": AnyCodable(sessionKey),
            "limit": AnyCodable(limit),
        ]
        self.add(agentID, to: &params, key: "agentId")
        return MangabaClawChatGatewayRequest(
            method: "tasks.list",
            params: params,
            timeoutMs: self.defaultTimeoutMs)
    }

    public static func questionGet(id: String) -> MangabaClawChatGatewayRequest {
        MangabaClawChatGatewayRequest(
            method: "question.get",
            params: ["id": AnyCodable(id)],
            timeoutMs: self.defaultTimeoutMs)
    }

    public static func resolveQuestion(
        id: String,
        answers: [String: [String]]) -> MangabaClawChatGatewayRequest
    {
        let values = answers.mapValues(AnyCodable.init)
        return MangabaClawChatGatewayRequest(
            method: "question.resolve",
            params: [
                "id": AnyCodable(id),
                "answers": AnyCodable(values),
            ],
            timeoutMs: self.mutationTimeoutMs)
    }

    public static func cancelQuestion(id: String) -> MangabaClawChatGatewayRequest {
        MangabaClawChatGatewayRequest(
            method: "question.resolve",
            params: [
                "id": AnyCodable(id),
                "cancel": AnyCodable(true),
            ],
            timeoutMs: self.mutationTimeoutMs)
    }

    public static func sessionsList(
        limit: Int?,
        search: String?,
        archived: Bool,
        includeGlobal: Bool = true,
        includeUnknown: Bool = false,
        activeMinutes: Int? = nil,
        spawnedBy: String? = nil,
        offset: Int? = nil,
        configuredAgentsOnly: Bool? = nil,
        timeoutMs: Double = 15000) -> MangabaClawChatGatewayRequest
    {
        var params: [String: AnyCodable] = [
            "includeGlobal": AnyCodable(includeGlobal),
            "includeUnknown": AnyCodable(includeUnknown),
        ]
        if let limit {
            params["limit"] = AnyCodable(limit)
        }
        if let activeMinutes {
            params["activeMinutes"] = AnyCodable(activeMinutes)
        }
        if let spawnedBy = normalized(spawnedBy) {
            params["spawnedBy"] = AnyCodable(spawnedBy)
        }
        if let offset {
            params["offset"] = AnyCodable(offset)
        }
        if let configuredAgentsOnly {
            params["configuredAgentsOnly"] = AnyCodable(configuredAgentsOnly)
        }
        let normalizedSearch = self.normalized(search)
        if let normalizedSearch {
            params["search"] = AnyCodable(normalizedSearch)
        }
        if archived {
            params["archived"] = AnyCodable(true)
        }
        return MangabaClawChatGatewayRequest(
            method: "sessions.list",
            params: params,
            timeoutMs: timeoutMs)
    }

    public static func sessionGroupsList() -> MangabaClawChatGatewayRequest {
        MangabaClawChatGatewayRequest(
            method: "sessions.groups.list",
            timeoutMs: self.defaultTimeoutMs)
    }

    public static func sessionGroupsPut(names: [String]) -> MangabaClawChatGatewayRequest {
        MangabaClawChatGatewayRequest(
            method: "sessions.groups.put",
            params: ["names": AnyCodable(names)],
            timeoutMs: self.mutationTimeoutMs)
    }

    public static func sessionGroupsRename(
        name: String,
        to: String) -> MangabaClawChatGatewayRequest
    {
        MangabaClawChatGatewayRequest(
            method: "sessions.groups.rename",
            params: [
                "name": AnyCodable(name),
                "to": AnyCodable(to),
            ],
            timeoutMs: self.mutationTimeoutMs)
    }

    public static func sessionGroupsDelete(name: String) -> MangabaClawChatGatewayRequest {
        MangabaClawChatGatewayRequest(
            method: "sessions.groups.delete",
            params: ["name": AnyCodable(name)],
            timeoutMs: self.mutationTimeoutMs)
    }

    public static func createSession(
        key: String,
        agentID: String?,
        label: String?,
        parentSessionKey: String?,
        worktree: Bool?,
        worktreeBaseRef: String? = nil) -> MangabaClawChatGatewayRequest
    {
        var params = ["key": AnyCodable(key)]
        self.add(agentID, to: &params, key: "agentId")
        self.add(label, to: &params, key: "label", trim: false)
        self.add(parentSessionKey, to: &params, key: "parentSessionKey", trim: false)
        if let worktree {
            params["worktree"] = AnyCodable(worktree)
        }
        self.add(worktreeBaseRef, to: &params, key: "worktreeBaseRef")
        return MangabaClawChatGatewayRequest(
            method: "sessions.create",
            params: params,
            timeoutMs: self.mutationTimeoutMs)
    }

    public static func abortRun(
        sessionKey: String,
        agentID: String?,
        runID: String,
        requestTimeoutMs: Int = 10000) -> MangabaClawChatGatewayRequest
    {
        var params: [String: AnyCodable] = [
            "sessionKey": AnyCodable(sessionKey),
            "runId": AnyCodable(runID),
        ]
        self.add(agentID, to: &params, key: "agentId")
        return MangabaClawChatGatewayRequest(
            method: "chat.abort",
            params: params,
            timeoutMs: Double(requestTimeoutMs))
    }

    public static func patchSessionPreferences(
        sessionKey: String,
        agentID: String?,
        thinkingLevel: String?? = nil,
        fastMode: MangabaClawChatFastMode?? = nil,
        verboseLevel: String?? = nil) -> MangabaClawChatGatewayRequest
    {
        self.patchSessionSettings(
            sessionKey: sessionKey,
            agentID: agentID,
            thinkingLevel: thinkingLevel,
            fastMode: fastMode,
            verboseLevel: verboseLevel)
    }

    public static func patchSessionSettings(
        sessionKey: String,
        agentID: String?,
        model: String?? = nil,
        thinkingLevel: String?? = nil,
        fastMode: MangabaClawChatFastMode?? = nil,
        verboseLevel: String?? = nil) -> MangabaClawChatGatewayRequest
    {
        var params = self.sessionParams(sessionKey: sessionKey, agentID: agentID)
        if let model {
            params["model"] = model.map(AnyCodable.init) ?? AnyCodable(NSNull())
        }
        if let thinkingLevel {
            params["thinkingLevel"] = thinkingLevel.map(AnyCodable.init) ?? AnyCodable(NSNull())
        }
        if let fastMode {
            params["fastMode"] = fastMode.map(self.fastModeValue) ?? AnyCodable(NSNull())
        }
        if let verboseLevel {
            params["verboseLevel"] = verboseLevel.map(AnyCodable.init) ?? AnyCodable(NSNull())
        }
        return MangabaClawChatGatewayRequest(
            method: "sessions.patch",
            params: params,
            timeoutMs: self.mutationTimeoutMs)
    }

    private static func fastModeValue(_ mode: MangabaClawChatFastMode) -> AnyCodable {
        switch mode {
        case .off: AnyCodable(false)
        case .on: AnyCodable(true)
        case .automatic: AnyCodable("auto")
        }
    }

    public static func patchSession(
        sessionKey: String,
        agentID: String?,
        expectedSessionID: String? = nil,
        label: String??,
        category: String??,
        pinned: Bool?,
        archived: Bool?,
        unread: Bool?) -> MangabaClawChatGatewayRequest
    {
        var params = self.sessionParams(sessionKey: sessionKey, agentID: agentID)
        if let expectedSessionID = expectedSessionID?.trimmingCharacters(in: .whitespacesAndNewlines),
           !expectedSessionID.isEmpty
        {
            params["expectedSessionId"] = AnyCodable(expectedSessionID)
        }
        if let label {
            params["label"] = label.map(AnyCodable.init) ?? AnyCodable(NSNull())
        }
        if let category {
            params["category"] = category.map(AnyCodable.init) ?? AnyCodable(NSNull())
        }
        if let pinned {
            params["pinned"] = AnyCodable(pinned)
        }
        if let archived {
            params["archived"] = AnyCodable(archived)
        }
        if let unread {
            params["unread"] = AnyCodable(unread)
        }
        return MangabaClawChatGatewayRequest(
            method: "sessions.patch",
            params: params,
            timeoutMs: archived == true ? self.archiveMutationTimeoutMs : self.mutationTimeoutMs)
    }

    public static func deleteSession(
        sessionKey: String,
        agentID: String?) -> MangabaClawChatGatewayRequest
    {
        var params = self.sessionParams(sessionKey: sessionKey, agentID: agentID)
        params["deleteTranscript"] = AnyCodable(true)
        return MangabaClawChatGatewayRequest(
            method: "sessions.delete",
            params: params,
            timeoutMs: self.mutationTimeoutMs)
    }

    public static func forkSession(
        parentSessionKey: String,
        agentID: String?,
        fromLastCompleted: Bool = false) -> MangabaClawChatGatewayRequest
    {
        var params: [String: AnyCodable] = [
            "parentSessionKey": AnyCodable(parentSessionKey),
            "fork": AnyCodable(true),
        ]
        if fromLastCompleted {
            params["forkFrom"] = AnyCodable("last-completed")
        }
        self.add(agentID, to: &params, key: "agentId")
        return MangabaClawChatGatewayRequest(
            method: "sessions.create",
            params: params,
            timeoutMs: self.mutationTimeoutMs)
    }

    public static func rewindSession(
        sessionKey: String,
        agentID: String?,
        entryId: String) -> MangabaClawChatGatewayRequest
    {
        var params = self.sessionParams(
            sessionKey: sessionKey,
            agentID: agentID,
            key: "sessionKey")
        self.add(entryId, to: &params, key: "entryId")
        return MangabaClawChatGatewayRequest(
            method: "sessions.rewind",
            params: params,
            timeoutMs: self.mutationTimeoutMs)
    }

    public static func forkAtMessage(
        sessionKey: String,
        agentID: String?,
        entryId: String) -> MangabaClawChatGatewayRequest
    {
        var params = self.sessionParams(
            sessionKey: sessionKey,
            agentID: agentID,
            key: "sessionKey")
        self.add(entryId, to: &params, key: "entryId")
        return MangabaClawChatGatewayRequest(
            method: "sessions.fork",
            params: params,
            timeoutMs: self.mutationTimeoutMs)
    }

    public static func listSessionBranches(
        sessionKey: String,
        agentID: String?) -> MangabaClawChatGatewayRequest
    {
        let params = self.sessionParams(
            sessionKey: sessionKey,
            agentID: agentID,
            key: "sessionKey")
        return MangabaClawChatGatewayRequest(
            method: "sessions.branches.list",
            params: params,
            timeoutMs: self.defaultTimeoutMs)
    }

    public static func switchSessionBranch(
        sessionKey: String,
        agentID: String?,
        leafEntryId: String) -> MangabaClawChatGatewayRequest
    {
        var params = self.sessionParams(
            sessionKey: sessionKey,
            agentID: agentID,
            key: "sessionKey")
        self.add(leafEntryId, to: &params, key: "leafEntryId")
        return MangabaClawChatGatewayRequest(
            method: "sessions.branches.switch",
            params: params,
            timeoutMs: self.mutationTimeoutMs)
    }

    public static func subscribeSessions(timeoutMs: Double = 10000) -> MangabaClawChatGatewayRequest {
        MangabaClawChatGatewayRequest(
            method: "sessions.subscribe",
            timeoutMs: timeoutMs)
    }

    public static func setSessionObserverVisibility(
        _ visible: Bool,
        timeoutMs: Double = 10000) -> MangabaClawChatGatewayRequest
    {
        MangabaClawChatGatewayRequest(
            method: "sessions.observer.visibility",
            params: ["visible": AnyCodable(visible)],
            timeoutMs: timeoutMs)
    }

    public static func subscribeSessionMessages(
        sessionKey: String,
        agentID: String?) -> MangabaClawChatGatewayRequest
    {
        MangabaClawChatGatewayRequest(
            method: "sessions.messages.subscribe",
            params: self.sessionParams(sessionKey: sessionKey, agentID: agentID),
            timeoutMs: self.shortTimeoutMs)
    }

    public static func resetSession(
        sessionKey: String,
        agentID: String?) -> MangabaClawChatGatewayRequest
    {
        MangabaClawChatGatewayRequest(
            method: "sessions.reset",
            params: self.sessionParams(sessionKey: sessionKey, agentID: agentID),
            timeoutMs: self.shortTimeoutMs)
    }

    public static func compactSession(
        sessionKey: String,
        agentID: String?,
        maxLines: Int? = nil) -> MangabaClawChatGatewayRequest
    {
        var params = self.sessionParams(sessionKey: sessionKey, agentID: agentID)
        if let maxLines {
            params["maxLines"] = AnyCodable(maxLines)
        }
        return MangabaClawChatGatewayRequest(
            method: "sessions.compact",
            params: params,
            timeoutMs: self.compactionTimeoutMs)
    }

    public static func history(
        sessionKey: String,
        agentID: String?,
        limit: Int? = nil,
        maxChars: Int? = nil,
        timeoutMs: Int? = nil) -> MangabaClawChatGatewayRequest
    {
        var params: [String: AnyCodable] = ["sessionKey": AnyCodable(sessionKey)]
        self.add(agentID, to: &params, key: "agentId")
        if let limit {
            params["limit"] = AnyCodable(limit)
        }
        if let maxChars {
            params["maxChars"] = AnyCodable(maxChars)
        }
        return MangabaClawChatGatewayRequest(
            method: "chat.history",
            params: params,
            timeoutMs: timeoutMs.map(Double.init) ?? self.defaultTimeoutMs)
    }

    public static func progressCardGet(sessionKey: String) -> MangabaClawChatGatewayRequest {
        MangabaClawChatGatewayRequest(
            method: "progressCard.get",
            params: ["sessionKey": AnyCodable(sessionKey)],
            timeoutMs: self.defaultTimeoutMs)
    }

    public static func commandsList(
        sessionKey: String?,
        fallbackAgentID: String?) -> MangabaClawChatGatewayRequest
    {
        var params: [String: AnyCodable] = [
            "scope": AnyCodable("text"),
            "includeArgs": AnyCodable(true),
        ]
        self.add(
            sessionKey.flatMap(MangabaClawChatSessionKey.agentID) ?? fallbackAgentID,
            to: &params,
            key: "agentId")
        return MangabaClawChatGatewayRequest(
            method: "commands.list",
            params: params,
            timeoutMs: self.defaultTimeoutMs)
    }

    public static func sendMessage(
        sessionKey: String,
        agentID: String?,
        expectedSessionRoutingContract: String?,
        message: String,
        thinking: String?,
        idempotencyKey: String,
        attachments: [MangabaClawChatAttachmentPayload],
        runTimeoutMs: Int? = nil,
        requestTimeoutMs: Int = 30000) -> MangabaClawChatGatewayRequest
    {
        var params: [String: AnyCodable] = [
            "sessionKey": AnyCodable(sessionKey),
            "message": AnyCodable(message),
            "idempotencyKey": AnyCodable(idempotencyKey),
        ]
        self.add(agentID, to: &params, key: "agentId")
        self.add(
            expectedSessionRoutingContract,
            to: &params,
            key: "expectedSessionRoutingContract")
        self.add(thinking, to: &params, key: "thinking")
        if let runTimeoutMs {
            params["timeoutMs"] = AnyCodable(runTimeoutMs)
        }
        if !attachments.isEmpty {
            let encoded = attachments.map { attachment in
                [
                    "type": attachment.type,
                    "mimeType": attachment.mimeType,
                    "fileName": attachment.fileName,
                    "content": attachment.content,
                ]
            }
            params["attachments"] = AnyCodable(encoded)
        }
        return MangabaClawChatGatewayRequest(
            method: "chat.send",
            params: params,
            timeoutMs: Double(requestTimeoutMs))
    }

    public static func agentWait(
        runID: String,
        timeoutMs: Int,
        requestGraceMs: Int = 5000) -> MangabaClawChatGatewayRequest
    {
        MangabaClawChatGatewayRequest(
            method: "agent.wait",
            params: [
                "runId": AnyCodable(runID),
                "timeoutMs": AnyCodable(timeoutMs),
            ],
            timeoutMs: Double(timeoutMs + requestGraceMs))
    }

    public static func health(timeoutMs: Int) -> MangabaClawChatGatewayRequest {
        MangabaClawChatGatewayRequest(
            method: "health",
            timeoutMs: Double(max(1, timeoutMs)))
    }

    private static func sessionParams(
        sessionKey: String,
        agentID: String?,
        key: String = "key") -> [String: AnyCodable]
    {
        var params = [key: AnyCodable(sessionKey)]
        self.add(agentID, to: &params, key: "agentId")
        return params
    }

    private static func add(
        _ value: String?,
        to params: inout [String: AnyCodable],
        key: String,
        trim: Bool = true)
    {
        let value = trim ? self.normalized(value) : value
        if let value {
            params[key] = AnyCodable(value)
        }
    }

    private static func normalized(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized?.isEmpty == false ? normalized : nil
    }
}

extension GatewayNodeSession {
    public func request(
        _ request: MangabaClawChatGatewayRequest,
        ifCurrentRoute expectedRoute: GatewayNodeSessionRoute? = nil,
        distinguishPreDispatchRouteChange: Bool = false) async throws -> Data
    {
        try await self.request(
            method: request.method,
            params: request.params,
            timeoutMs: request.timeoutMs,
            ifCurrentRoute: expectedRoute,
            distinguishPreDispatchRouteChange: distinguishPreDispatchRouteChange)
    }
}
