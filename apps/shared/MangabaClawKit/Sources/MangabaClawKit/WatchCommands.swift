import Foundation

public enum MangabaClawWatchCommand: String, Codable, Sendable {
    case status = "watch.status"
    case notify = "watch.notify"
}

public enum MangabaClawWatchPayloadType: String, Codable, Sendable, Equatable {
    case notify = "watch.notify"
    case directNodeSetup = "watch.node.setup"
    case reply = "watch.reply"
    case appSnapshot = "watch.app.snapshot"
    case appSnapshotRequest = "watch.app.snapshotRequest"
    case appCommand = "watch.app.command"
    case chatCompletion = "watch.chat.completion"
    case execApprovalPrompt = "watch.execApproval.prompt"
    case execApprovalResolve = "watch.execApproval.resolve"
    case execApprovalResolved = "watch.execApproval.resolved"
    case execApprovalExpired = "watch.execApproval.expired"
    case execApprovalSnapshot = "watch.execApproval.snapshot"
    case execApprovalSnapshotRequest = "watch.execApproval.snapshotRequest"
}

public enum MangabaClawWatchRisk: String, Codable, Sendable, Equatable {
    case low
    case medium
    case high
}

public enum MangabaClawWatchExecApprovalDecision: String, Codable, Sendable, Equatable {
    case allowOnce = "allow-once"
    case deny
}

public enum MangabaClawWatchExecApprovalCloseReason: String, Codable, Sendable, Equatable {
    case expired
    case notFound = "not-found"
    case unavailable
    case replaced
    case resolved
}

public struct MangabaClawWatchAction: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var label: String
    public var style: String?

    public init(id: String, label: String, style: String? = nil) {
        self.id = id
        self.label = label
        self.style = style
    }
}

public struct MangabaClawWatchExecApprovalItem: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var gatewayStableID: String?
    public var commandText: String
    public var commandPreview: String?
    public var warningText: String?
    public var host: String?
    public var nodeId: String?
    public var agentId: String?
    public var expiresAtMs: Int64?
    public var allowedDecisions: [MangabaClawWatchExecApprovalDecision]
    public var risk: MangabaClawWatchRisk?

    public init(
        id: String,
        gatewayStableID: String? = nil,
        commandText: String,
        commandPreview: String? = nil,
        warningText: String? = nil,
        host: String? = nil,
        nodeId: String? = nil,
        agentId: String? = nil,
        expiresAtMs: Int64? = nil,
        allowedDecisions: [MangabaClawWatchExecApprovalDecision] = [],
        risk: MangabaClawWatchRisk? = nil)
    {
        self.id = id
        self.gatewayStableID = gatewayStableID
        self.commandText = commandText
        self.commandPreview = commandPreview
        self.warningText = warningText
        self.host = host
        self.nodeId = nodeId
        self.agentId = agentId
        self.expiresAtMs = expiresAtMs
        self.allowedDecisions = allowedDecisions
        self.risk = risk
    }
}

public struct MangabaClawWatchExecApprovalPromptMessage: Codable, Sendable, Equatable {
    public var type: MangabaClawWatchPayloadType
    public var approval: MangabaClawWatchExecApprovalItem
    public var sentAtMs: Int64?
    public var resetResolutionAttemptId: String?

    public init(
        approval: MangabaClawWatchExecApprovalItem,
        sentAtMs: Int64? = nil,
        resetResolutionAttemptId: String? = nil)
    {
        self.type = .execApprovalPrompt
        self.approval = approval
        self.sentAtMs = sentAtMs
        self.resetResolutionAttemptId = resetResolutionAttemptId
    }
}

public struct MangabaClawWatchExecApprovalResolveMessage: Codable, Sendable, Equatable {
    public var type: MangabaClawWatchPayloadType
    public var approvalId: String
    public var gatewayStableID: String?
    public var decision: MangabaClawWatchExecApprovalDecision
    public var replyId: String
    public var sentAtMs: Int64?

    public init(
        approvalId: String,
        gatewayStableID: String? = nil,
        decision: MangabaClawWatchExecApprovalDecision,
        replyId: String,
        sentAtMs: Int64? = nil)
    {
        self.type = .execApprovalResolve
        self.approvalId = approvalId
        self.gatewayStableID = gatewayStableID
        self.decision = decision
        self.replyId = replyId
        self.sentAtMs = sentAtMs
    }
}

public enum MangabaClawWatchExecApprovalOutcome: String, Codable, Sendable, Equatable {
    case allowedOnce
    case allowedAlways
    case denied
}

public struct MangabaClawWatchExecApprovalResolvedMessage: Codable, Sendable, Equatable {
    public var type: MangabaClawWatchPayloadType
    public var approvalId: String
    public var gatewayStableID: String?
    public var decision: MangabaClawWatchExecApprovalDecision?
    public var outcome: MangabaClawWatchExecApprovalOutcome?
    public var resolvedAtMs: Int64?
    public var source: String?
    public var outcomeText: String?

    public init(
        approvalId: String,
        gatewayStableID: String? = nil,
        decision: MangabaClawWatchExecApprovalDecision? = nil,
        outcome: MangabaClawWatchExecApprovalOutcome? = nil,
        resolvedAtMs: Int64? = nil,
        source: String? = nil,
        outcomeText: String? = nil)
    {
        self.type = .execApprovalResolved
        self.approvalId = approvalId
        self.gatewayStableID = gatewayStableID
        self.decision = decision
        self.outcome = outcome
        self.resolvedAtMs = resolvedAtMs
        self.source = source
        self.outcomeText = outcomeText
    }
}

public struct MangabaClawWatchExecApprovalExpiredMessage: Codable, Sendable, Equatable {
    public var type: MangabaClawWatchPayloadType
    public var approvalId: String
    public var gatewayStableID: String?
    public var reason: MangabaClawWatchExecApprovalCloseReason
    public var expiredAtMs: Int64?

    public init(
        approvalId: String,
        gatewayStableID: String? = nil,
        reason: MangabaClawWatchExecApprovalCloseReason,
        expiredAtMs: Int64? = nil)
    {
        self.type = .execApprovalExpired
        self.approvalId = approvalId
        self.gatewayStableID = gatewayStableID
        self.reason = reason
        self.expiredAtMs = expiredAtMs
    }
}

public struct MangabaClawWatchExecApprovalSnapshotMessage: Codable, Sendable, Equatable {
    public var type: MangabaClawWatchPayloadType
    public var approvals: [MangabaClawWatchExecApprovalItem]
    public var gatewayStableID: String?
    public var sentAtMs: Int64?
    public var snapshotId: String?
    public var requestId: String?
    public var requestGatewayStableID: String?

    public init(
        approvals: [MangabaClawWatchExecApprovalItem],
        gatewayStableID: String? = nil,
        sentAtMs: Int64? = nil,
        snapshotId: String? = nil,
        requestId: String? = nil,
        requestGatewayStableID: String? = nil)
    {
        self.type = .execApprovalSnapshot
        self.approvals = approvals
        self.gatewayStableID = gatewayStableID
        self.sentAtMs = sentAtMs
        self.snapshotId = snapshotId
        self.requestId = requestId
        self.requestGatewayStableID = requestGatewayStableID
    }
}

public struct MangabaClawWatchExecApprovalSnapshotRequestItem: Codable, Sendable, Equatable {
    public var approvalId: String
    public var activeResolutionAttemptId: String?

    public init(
        approvalId: String,
        activeResolutionAttemptId: String? = nil)
    {
        self.approvalId = approvalId
        self.activeResolutionAttemptId = activeResolutionAttemptId
    }
}

public struct MangabaClawWatchExecApprovalSnapshotRequestMessage: Codable, Sendable, Equatable {
    public var type: MangabaClawWatchPayloadType
    public var requestId: String
    public var sentAtMs: Int64?
    public var gatewayStableID: String?
    public var heldApprovals: [MangabaClawWatchExecApprovalSnapshotRequestItem]

    public init(
        requestId: String,
        sentAtMs: Int64? = nil,
        gatewayStableID: String? = nil,
        heldApprovals: [MangabaClawWatchExecApprovalSnapshotRequestItem] = [])
    {
        self.type = .execApprovalSnapshotRequest
        self.requestId = requestId
        self.sentAtMs = sentAtMs
        self.gatewayStableID = gatewayStableID
        self.heldApprovals = heldApprovals
    }
}

public struct MangabaClawWatchChatItem: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var role: String
    public var text: String
    public var timestampMs: Int64?

    public init(
        id: String,
        role: String,
        text: String,
        timestampMs: Int64? = nil)
    {
        self.id = id
        self.role = role
        self.text = text
        self.timestampMs = timestampMs
    }
}

public struct MangabaClawWatchChatCompletionMessage: Codable, Sendable, Equatable {
    public var type: MangabaClawWatchPayloadType
    public var commandId: String
    public var replyText: String
    public var sentAtMs: Int64?

    public init(commandId: String, replyText: String, sentAtMs: Int64? = nil) {
        self.type = .chatCompletion
        self.commandId = commandId
        self.replyText = replyText
        self.sentAtMs = sentAtMs
    }
}

public enum MangabaClawWatchAppStatusCode: String, Codable, Sendable, Equatable {
    case gatewayConnected
    case gatewayConnecting
    case gatewayReconnecting
    case gatewayOffline
    case gatewayProblem
    case gatewayProblemWithRequestID
    case talkOff
    case talkReady
    case talkConnecting
    case talkListening
    case talkThinking
    case talkSpeaking
    case talkOffline
    case talkPermissionRequired
    case talkRequestingApproval
    case talkApprovalRequested
    case talkAPIKeyMissing
    case talkFailure
    case chatConnectIPhone
    case chatNoMessages
    case chatUnavailable
    case legacy
}

public struct MangabaClawWatchAppStatus: Codable, Sendable, Equatable {
    public var code: MangabaClawWatchAppStatusCode
    public var localizationKey: String?
    public var arguments: [String]
    public var verbatim: String?

    public init(
        code: MangabaClawWatchAppStatusCode,
        localizationKey: String? = nil,
        arguments: [String] = [],
        verbatim: String? = nil)
    {
        self.code = code
        self.localizationKey = localizationKey
        self.arguments = arguments
        self.verbatim = verbatim
    }
}

public struct MangabaClawWatchAppSnapshotMessage: Codable, Sendable, Equatable {
    public var type: MangabaClawWatchPayloadType
    public var gatewayStatus: MangabaClawWatchAppStatus
    public var gatewayStatusText: String
    public var gatewayConnected: Bool
    public var agentName: String
    public var agentAvatarURL: String?
    public var agentAvatarText: String?
    public var sessionKey: String
    public var gatewayStableID: String?
    public var talkStatus: MangabaClawWatchAppStatus
    public var talkStatusText: String
    public var talkEnabled: Bool
    public var talkListening: Bool
    public var talkSpeaking: Bool
    public var pendingApprovalCount: Int
    public var chatItems: [MangabaClawWatchChatItem]?
    public var chatStatus: MangabaClawWatchAppStatus?
    public var chatStatusText: String?
    public var sentAtMs: Int64?
    public var snapshotId: String?

    public init(
        gatewayStatus: MangabaClawWatchAppStatus,
        gatewayStatusText: String,
        gatewayConnected: Bool,
        agentName: String,
        agentAvatarURL: String? = nil,
        agentAvatarText: String? = nil,
        sessionKey: String,
        gatewayStableID: String? = nil,
        talkStatus: MangabaClawWatchAppStatus,
        talkStatusText: String,
        talkEnabled: Bool,
        talkListening: Bool,
        talkSpeaking: Bool,
        pendingApprovalCount: Int,
        chatItems: [MangabaClawWatchChatItem]? = nil,
        chatStatus: MangabaClawWatchAppStatus? = nil,
        chatStatusText: String? = nil,
        sentAtMs: Int64? = nil,
        snapshotId: String? = nil)
    {
        self.type = .appSnapshot
        self.gatewayStatus = gatewayStatus
        self.gatewayStatusText = gatewayStatusText
        self.gatewayConnected = gatewayConnected
        self.agentName = agentName
        self.agentAvatarURL = agentAvatarURL
        self.agentAvatarText = agentAvatarText
        self.sessionKey = sessionKey
        self.gatewayStableID = gatewayStableID
        self.talkStatus = talkStatus
        self.talkStatusText = talkStatusText
        self.talkEnabled = talkEnabled
        self.talkListening = talkListening
        self.talkSpeaking = talkSpeaking
        self.pendingApprovalCount = pendingApprovalCount
        self.chatItems = chatItems
        self.chatStatus = chatStatus
        self.chatStatusText = chatStatusText ?? chatStatus.map(Self.legacyText)
        self.sentAtMs = sentAtMs
        self.snapshotId = snapshotId
    }

    public init(
        gatewayStatusText: String,
        gatewayConnected: Bool,
        agentName: String,
        agentAvatarURL: String? = nil,
        agentAvatarText: String? = nil,
        sessionKey: String,
        gatewayStableID: String? = nil,
        talkStatusText: String,
        talkEnabled: Bool,
        talkListening: Bool,
        talkSpeaking: Bool,
        pendingApprovalCount: Int,
        chatItems: [MangabaClawWatchChatItem]? = nil,
        chatStatusText: String? = nil,
        sentAtMs: Int64? = nil,
        snapshotId: String? = nil)
    {
        // Preserve the shipped source API while producers migrate to semantic statuses.
        self.init(
            gatewayStatus: Self.decodeLegacyGatewayStatus(
                text: gatewayStatusText,
                connected: gatewayConnected),
            gatewayStatusText: gatewayStatusText,
            gatewayConnected: gatewayConnected,
            agentName: agentName,
            agentAvatarURL: agentAvatarURL,
            agentAvatarText: agentAvatarText,
            sessionKey: sessionKey,
            gatewayStableID: gatewayStableID,
            talkStatus: Self.decodeLegacyTalkStatus(
                text: talkStatusText,
                enabled: talkEnabled,
                listening: talkListening,
                speaking: talkSpeaking),
            talkStatusText: talkStatusText,
            talkEnabled: talkEnabled,
            talkListening: talkListening,
            talkSpeaking: talkSpeaking,
            pendingApprovalCount: pendingApprovalCount,
            chatItems: chatItems,
            chatStatus: Self.decodeLegacyChatStatus(code: nil, text: chatStatusText),
            chatStatusText: chatStatusText,
            sentAtMs: sentAtMs,
            snapshotId: snapshotId)
    }

    private enum CodingKeys: String, CodingKey {
        case type
        case gatewayStatus
        case gatewayStatusText
        case gatewayConnected
        case agentName
        case agentAvatarURL
        case agentAvatarText
        case sessionKey
        case gatewayStableID
        case talkStatus
        case talkStatusText
        case talkEnabled
        case talkListening
        case talkSpeaking
        case pendingApprovalCount
        case chatItems
        case chatStatus
        case chatStatusCode
        case chatStatusText
        case sentAtMs
        case snapshotId
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.type = try container.decode(MangabaClawWatchPayloadType.self, forKey: .type)
        self.gatewayConnected = try container.decode(Bool.self, forKey: .gatewayConnected)
        self.agentName = try container.decode(String.self, forKey: .agentName)
        self.agentAvatarURL = try container.decodeIfPresent(String.self, forKey: .agentAvatarURL)
        self.agentAvatarText = try container.decodeIfPresent(String.self, forKey: .agentAvatarText)
        self.sessionKey = try container.decode(String.self, forKey: .sessionKey)
        self.gatewayStableID = try container.decodeIfPresent(String.self, forKey: .gatewayStableID)
        self.talkEnabled = try container.decode(Bool.self, forKey: .talkEnabled)
        self.talkListening = try container.decode(Bool.self, forKey: .talkListening)
        self.talkSpeaking = try container.decode(Bool.self, forKey: .talkSpeaking)
        self.pendingApprovalCount = try container.decode(Int.self, forKey: .pendingApprovalCount)
        self.chatItems = try container.decodeIfPresent([MangabaClawWatchChatItem].self, forKey: .chatItems)
        self.sentAtMs = try container.decodeIfPresent(Int64.self, forKey: .sentAtMs)
        self.snapshotId = try container.decodeIfPresent(String.self, forKey: .snapshotId)

        let gatewayStatusText = try container.decodeIfPresent(String.self, forKey: .gatewayStatusText)
        if let gatewayStatus = try? container.decode(
            MangabaClawWatchAppStatus.self,
            forKey: .gatewayStatus)
        {
            self.gatewayStatus = gatewayStatus
        } else if container.contains(.gatewayStatus),
                  let gatewayStatusText,
                  !gatewayStatusText.isEmpty
        {
            self.gatewayStatus = MangabaClawWatchAppStatus(
                code: .legacy,
                verbatim: gatewayStatusText)
        } else {
            self.gatewayStatus = Self.decodeLegacyGatewayStatus(
                text: gatewayStatusText,
                connected: self.gatewayConnected)
        }
        self.gatewayStatusText = gatewayStatusText ?? Self.legacyText(for: self.gatewayStatus)
        let talkStatusText = try container.decodeIfPresent(String.self, forKey: .talkStatusText)
        if let talkStatus = try? container.decode(
            MangabaClawWatchAppStatus.self,
            forKey: .talkStatus)
        {
            self.talkStatus = talkStatus
        } else if container.contains(.talkStatus),
                  let talkStatusText,
                  !talkStatusText.isEmpty
        {
            self.talkStatus = MangabaClawWatchAppStatus(
                code: .legacy,
                verbatim: talkStatusText)
        } else {
            self.talkStatus = Self.decodeLegacyTalkStatus(
                text: talkStatusText,
                enabled: self.talkEnabled,
                listening: self.talkListening,
                speaking: self.talkSpeaking)
        }
        self.talkStatusText = talkStatusText ?? Self.legacyText(for: self.talkStatus)
        let chatStatusText = try container.decodeIfPresent(String.self, forKey: .chatStatusText)
        let chatStatusCode = try container.decodeIfPresent(String.self, forKey: .chatStatusCode)
        self.chatStatus = (try? container.decode(
            MangabaClawWatchAppStatus.self,
            forKey: .chatStatus)) ?? Self.decodeLegacyChatStatus(
            code: chatStatusCode,
            text: chatStatusText)
        self.chatStatusText = chatStatusText ?? self.chatStatus.map(Self.legacyText)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(self.type, forKey: .type)
        try container.encode(self.gatewayStatus, forKey: .gatewayStatus)
        // iPhone and watchOS updates are staggered. Keep the shipped text fields
        // until every supported Watch build decodes the semantic status payload.
        try container.encode(self.gatewayStatusText, forKey: .gatewayStatusText)
        try container.encode(self.gatewayConnected, forKey: .gatewayConnected)
        try container.encode(self.agentName, forKey: .agentName)
        try container.encodeIfPresent(self.agentAvatarURL, forKey: .agentAvatarURL)
        try container.encodeIfPresent(self.agentAvatarText, forKey: .agentAvatarText)
        try container.encode(self.sessionKey, forKey: .sessionKey)
        try container.encodeIfPresent(self.gatewayStableID, forKey: .gatewayStableID)
        try container.encode(self.talkStatus, forKey: .talkStatus)
        try container.encode(self.talkStatusText, forKey: .talkStatusText)
        try container.encode(self.talkEnabled, forKey: .talkEnabled)
        try container.encode(self.talkListening, forKey: .talkListening)
        try container.encode(self.talkSpeaking, forKey: .talkSpeaking)
        try container.encode(self.pendingApprovalCount, forKey: .pendingApprovalCount)
        try container.encodeIfPresent(self.chatItems, forKey: .chatItems)
        try container.encodeIfPresent(self.chatStatus, forKey: .chatStatus)
        try container.encodeIfPresent(self.chatStatusText, forKey: .chatStatusText)
        try container.encodeIfPresent(self.sentAtMs, forKey: .sentAtMs)
        try container.encodeIfPresent(self.snapshotId, forKey: .snapshotId)
    }

    private static func decodeLegacyGatewayStatus(
        text: String?,
        connected: Bool) -> MangabaClawWatchAppStatus
    {
        if connected {
            return MangabaClawWatchAppStatus(code: .gatewayConnected)
        }
        guard let text, !text.isEmpty else {
            return MangabaClawWatchAppStatus(code: .gatewayOffline)
        }
        return MangabaClawWatchAppStatus(code: .legacy, verbatim: text)
    }

    private static func decodeLegacyTalkStatus(
        text: String?,
        enabled: Bool,
        listening: Bool,
        speaking: Bool) -> MangabaClawWatchAppStatus
    {
        if speaking {
            return MangabaClawWatchAppStatus(code: .talkSpeaking)
        }
        if listening {
            return MangabaClawWatchAppStatus(code: .talkListening)
        }
        if !enabled {
            return MangabaClawWatchAppStatus(code: .talkOff)
        }
        guard let text, !text.isEmpty else {
            return MangabaClawWatchAppStatus(code: .talkReady)
        }
        return MangabaClawWatchAppStatus(code: .legacy, verbatim: text)
    }

    private static func decodeLegacyChatStatus(
        code: String?,
        text: String?) -> MangabaClawWatchAppStatus?
    {
        let statusCode: MangabaClawWatchAppStatusCode? = switch code {
        case "connectIPhone":
            MangabaClawWatchAppStatusCode.chatConnectIPhone
        case "noMessages":
            MangabaClawWatchAppStatusCode.chatNoMessages
        case "unavailable":
            MangabaClawWatchAppStatusCode.chatUnavailable
        default:
            nil
        }
        if let statusCode {
            return MangabaClawWatchAppStatus(code: statusCode)
        }
        guard let text, !text.isEmpty else { return nil }
        return MangabaClawWatchAppStatus(code: .legacy, verbatim: text)
    }

    private static func legacyText(for status: MangabaClawWatchAppStatus) -> String {
        if let verbatim = status.verbatim, !verbatim.isEmpty {
            return verbatim
        }
        if let localizationKey = status.localizationKey, !localizationKey.isEmpty {
            return localizationKey
        }
        return switch status.code {
        case .gatewayConnected,
             .gatewayConnecting,
             .gatewayReconnecting,
             .gatewayOffline,
             .gatewayProblem,
             .gatewayProblemWithRequestID:
            self.legacyGatewayText(for: status.code)
        case .talkOff,
             .talkReady,
             .talkConnecting,
             .talkListening,
             .talkThinking,
             .talkSpeaking,
             .talkOffline,
             .talkPermissionRequired,
             .talkRequestingApproval,
             .talkApprovalRequested,
             .talkAPIKeyMissing,
             .talkFailure:
            self.legacyTalkText(for: status.code)
        case .chatConnectIPhone, .chatNoMessages, .chatUnavailable:
            self.legacyChatText(for: status.code)
        case .legacy:
            "Unavailable"
        }
    }

    private static func legacyGatewayText(for code: MangabaClawWatchAppStatusCode) -> String {
        switch code {
        case .gatewayConnected: "Connected"
        case .gatewayConnecting: "Connecting…"
        case .gatewayReconnecting: "Reconnecting…"
        case .gatewayOffline: "Offline"
        case .gatewayProblem, .gatewayProblemWithRequestID: "Gateway unavailable"
        default: "Gateway unavailable"
        }
    }

    private static func legacyTalkText(for code: MangabaClawWatchAppStatusCode) -> String {
        switch code {
        case .talkOff: "Off"
        case .talkReady: "Ready"
        case .talkConnecting: "Connecting"
        case .talkListening: "Listening"
        case .talkThinking: "Thinking"
        case .talkSpeaking: "Speaking"
        case .talkOffline: "Offline"
        case .talkPermissionRequired: "Gateway permission required"
        case .talkRequestingApproval: "Requesting Talk approval"
        case .talkApprovalRequested: "Approval requested"
        case .talkAPIKeyMissing: "API key missing"
        case .talkFailure: "Talk unavailable"
        default: "Talk unavailable"
        }
    }

    private static func legacyChatText(for code: MangabaClawWatchAppStatusCode) -> String {
        switch code {
        case .chatConnectIPhone: "Connect iPhone chat to read messages"
        case .chatNoMessages: "No chat messages yet"
        case .chatUnavailable: "Chat unavailable"
        default: "Chat unavailable"
        }
    }
}

public struct MangabaClawWatchAppSnapshotRequestMessage: Codable, Sendable, Equatable {
    public var type: MangabaClawWatchPayloadType
    public var requestId: String
    public var sentAtMs: Int64?

    public init(requestId: String, sentAtMs: Int64? = nil) {
        self.type = .appSnapshotRequest
        self.requestId = requestId
        self.sentAtMs = sentAtMs
    }
}

public enum MangabaClawWatchAppCommand: String, Codable, Sendable, Equatable {
    case refresh
    case openChat = "open-chat"
    case sendChat = "send-chat"
    case startTalk = "start-talk"
    case stopTalk = "stop-talk"
}

public struct MangabaClawWatchAppCommandMessage: Codable, Sendable, Equatable {
    public var type: MangabaClawWatchPayloadType
    public var command: MangabaClawWatchAppCommand
    public var commandId: String
    public var sessionKey: String?
    public var gatewayStableID: String?
    public var text: String?
    public var sentAtMs: Int64?

    public init(
        command: MangabaClawWatchAppCommand,
        commandId: String,
        sessionKey: String? = nil,
        gatewayStableID: String? = nil,
        text: String? = nil,
        sentAtMs: Int64? = nil)
    {
        self.type = .appCommand
        self.command = command
        self.commandId = commandId
        self.sessionKey = sessionKey
        self.gatewayStableID = gatewayStableID
        self.text = text
        self.sentAtMs = sentAtMs
    }
}

public struct MangabaClawWatchStatusPayload: Codable, Sendable, Equatable {
    public var supported: Bool
    public var paired: Bool
    public var appInstalled: Bool
    public var reachable: Bool
    public var activationState: String

    public init(
        supported: Bool,
        paired: Bool,
        appInstalled: Bool,
        reachable: Bool,
        activationState: String)
    {
        self.supported = supported
        self.paired = paired
        self.appInstalled = appInstalled
        self.reachable = reachable
        self.activationState = activationState
    }
}

public struct MangabaClawWatchNotifyParams: Codable, Sendable, Equatable {
    public var title: String
    public var body: String
    public var priority: MangabaClawNotificationPriority?
    public var promptId: String?
    public var sessionKey: String?
    public var gatewayStableID: String?
    public var kind: String?
    public var details: String?
    public var expiresAtMs: Int64?
    public var risk: MangabaClawWatchRisk?
    public var actions: [MangabaClawWatchAction]?

    public init(
        title: String,
        body: String,
        priority: MangabaClawNotificationPriority? = nil,
        promptId: String? = nil,
        sessionKey: String? = nil,
        gatewayStableID: String? = nil,
        kind: String? = nil,
        details: String? = nil,
        expiresAtMs: Int64? = nil,
        risk: MangabaClawWatchRisk? = nil,
        actions: [MangabaClawWatchAction]? = nil)
    {
        self.title = title
        self.body = body
        self.priority = priority
        self.promptId = promptId
        self.sessionKey = sessionKey
        self.gatewayStableID = gatewayStableID
        self.kind = kind
        self.details = details
        self.expiresAtMs = expiresAtMs
        self.risk = risk
        self.actions = actions
    }
}

public struct MangabaClawWatchNotifyPayload: Codable, Sendable, Equatable {
    public var deliveredImmediately: Bool
    public var queuedForDelivery: Bool
    public var transport: String

    public init(deliveredImmediately: Bool, queuedForDelivery: Bool, transport: String) {
        self.deliveredImmediately = deliveredImmediately
        self.queuedForDelivery = queuedForDelivery
        self.transport = transport
    }
}
