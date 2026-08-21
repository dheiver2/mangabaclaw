import Foundation
import MangabaClawChatUI
import MangabaClawProtocol

extension MacGatewayChatTransport {
    func acquireNewSessionRouteLease() async -> MangabaClawChatNewSessionRouteLease? {
        guard let serverLease = await self.connection.captureServerLease() else { return nil }
        guard await self.currentOutboxGatewayMatchesConnection() else { return nil }
        let request: @Sendable (MangabaClawChatGatewayRequest) async throws -> Data = { request in
            try await self.connection.request(
                method: request.method,
                params: request.params,
                timeoutMs: request.timeoutMs,
                ifCurrentServerLease: serverLease)
        }
        return MangabaClawChatNewSessionRouteLease(
            listAgents: {
                let data = try await request(MangabaClawChatGatewayRequests.agentsList())
                let result = try JSONDecoder().decode(AgentsListResult.self, from: data)
                return MangabaClawChatAgentsListResponse(
                    defaultId: result.defaultid,
                    agents: result.agents.filter(\.isSelectableAgent).map {
                        MangabaClawChatAgentChoice(
                            id: $0.id,
                            name: $0.name,
                            workspaceGit: $0.workspacegit)
                    })
            },
            createSession: { key, label, explicitAgentID, parentSessionKey, worktree, worktreeBaseRef in
                let agentID = explicitAgentID
                    ?? MangabaClawChatSessionKey.agentID(from: key)
                    ?? parentSessionKey.flatMap { MangabaClawChatSessionKey.agentID(from: $0) }
                let createRequest = MangabaClawChatGatewayRequests.createSession(
                    key: key,
                    agentID: agentID,
                    label: label,
                    parentSessionKey: parentSessionKey,
                    worktree: worktree,
                    worktreeBaseRef: worktreeBaseRef)
                let data = try await request(createRequest)
                return try JSONDecoder().decode(MangabaClawChatCreateSessionResponse.self, from: data)
            })
    }

    func acquireSessionGroupsRouteLease() async -> MangabaClawChatSessionGroupsRouteLease? {
        guard let serverLease = await self.connection.captureServerLease() else { return nil }
        guard await self.currentOutboxGatewayMatchesConnection() else { return nil }
        let request: @Sendable (MangabaClawChatGatewayRequest) async throws -> Data = { request in
            try await self.connection.request(
                method: request.method,
                params: request.params,
                timeoutMs: request.timeoutMs,
                ifCurrentServerLease: serverLease)
        }
        return MangabaClawChatSessionGroupsRouteLease(
            listGroups: {
                let data = try await request(MangabaClawChatGatewayRequests.sessionGroupsList())
                return try JSONDecoder().decode(MangabaClawChatSessionGroupsResponse.self, from: data)
            },
            putGroups: { names in
                let data = try await request(MangabaClawChatGatewayRequests.sessionGroupsPut(names: names))
                return try JSONDecoder().decode(MangabaClawChatSessionGroupsMutationResponse.self, from: data)
            },
            renameGroup: { name, to in
                let data = try await request(MangabaClawChatGatewayRequests.sessionGroupsRename(name: name, to: to))
                return try JSONDecoder().decode(MangabaClawChatSessionGroupsMutationResponse.self, from: data)
            },
            deleteGroup: { name in
                let data = try await request(MangabaClawChatGatewayRequests.sessionGroupsDelete(name: name))
                return try JSONDecoder().decode(MangabaClawChatSessionGroupsMutationResponse.self, from: data)
            })
    }

    func acquireSessionMutationRouteLease() async -> MangabaClawChatSessionMutationRouteLease? {
        guard let serverLease = await self.connection.captureServerLease() else { return nil }
        guard await self.currentOutboxGatewayMatchesConnection() else { return nil }
        let transport = self
        return MangabaClawChatSessionMutationRouteLease(
            patchSession: { key, expectedSessionID, label, category, pinned, archived, unread in
                let target = transport.sessionTarget(for: key)
                let request = MangabaClawChatGatewayRequests.patchSession(
                    sessionKey: target.sessionKey,
                    agentID: target.agentID,
                    expectedSessionID: expectedSessionID,
                    label: label,
                    category: category,
                    pinned: pinned,
                    archived: archived,
                    unread: unread)
                _ = try await self.connection.request(
                    method: request.method,
                    params: request.params,
                    timeoutMs: request.timeoutMs,
                    ifCurrentServerLease: serverLease)
            },
            deleteSession: { key in
                let target = transport.sessionTarget(for: key)
                let request = MangabaClawChatGatewayRequests.deleteSession(
                    sessionKey: target.sessionKey,
                    agentID: target.agentID)
                _ = try await self.connection.request(
                    method: request.method,
                    params: request.params,
                    timeoutMs: request.timeoutMs,
                    ifCurrentServerLease: serverLease)
            })
    }

    private func requestSessionAction(_ request: MangabaClawChatGatewayRequest) async throws -> Data {
        guard let serverLease = await self.connection.captureServerLease() else {
            throw MangabaClawChatTransportSendError.notDispatched
        }
        try await self.requireCurrentOutboxGateway()
        return try await self.connection.request(
            method: request.method,
            params: request.params,
            timeoutMs: request.timeoutMs,
            ifCurrentServerLease: serverLease)
    }

    func forkSession(parentKey: String) async throws -> String {
        try await self.forkSession(parentKey: parentKey, fromLastCompleted: false)
    }

    func forkSession(parentKey: String, fromLastCompleted: Bool) async throws -> String {
        let target = self.sessionTarget(for: parentKey)
        let request = MangabaClawChatGatewayRequests.forkSession(
            parentSessionKey: target.sessionKey,
            agentID: target.agentID,
            fromLastCompleted: fromLastCompleted)
        let data = try await self.requestSessionAction(request)
        return try JSONDecoder().decode(MangabaClawChatCreateSessionResponse.self, from: data).key
    }

    func rewindSession(
        sessionKey: String,
        entryId: String) async throws -> MangabaClawChatRewindResponse
    {
        let target = self.sessionTarget(for: sessionKey)
        let request = Self.rewindSessionRequest(
            sessionKey: target.sessionKey,
            agentID: target.agentID,
            entryId: entryId)
        let data = try await self.requestSessionAction(request)
        return try JSONDecoder().decode(MangabaClawChatRewindResponse.self, from: data)
    }

    func forkSessionAtMessage(
        sessionKey: String,
        entryId: String) async throws -> MangabaClawChatForkAtMessageResponse
    {
        let target = self.sessionTarget(for: sessionKey)
        let request = Self.forkSessionAtMessageRequest(
            sessionKey: target.sessionKey,
            agentID: target.agentID,
            entryId: entryId)
        let data = try await self.requestSessionAction(request)
        return try JSONDecoder().decode(MangabaClawChatForkAtMessageResponse.self, from: data)
    }

    func listSessionBranches(
        sessionKey: String,
        agentID: String?) async throws -> MangabaClawChatSessionBranchesResponse
    {
        let target = self.sessionTarget(for: sessionKey, overrideAgentID: agentID)
        let request = MangabaClawChatGatewayRequests.listSessionBranches(
            sessionKey: target.sessionKey,
            agentID: target.agentID)
        let data = try await self.requestSessionAction(request)
        return try JSONDecoder().decode(MangabaClawChatSessionBranchesResponse.self, from: data)
    }

    func switchSessionBranch(sessionKey: String, agentID: String?, leafEntryId: String) async throws {
        let target = self.sessionTarget(for: sessionKey)
        let request = MangabaClawChatGatewayRequests.switchSessionBranch(
            sessionKey: target.sessionKey,
            agentID: agentID ?? target.agentID,
            leafEntryId: leafEntryId)
        _ = try await self.requestSessionAction(request)
    }

    static func rewindSessionRequest(
        sessionKey: String,
        agentID: String?,
        entryId: String) -> MangabaClawChatGatewayRequest
    {
        MangabaClawChatGatewayRequests.rewindSession(
            sessionKey: sessionKey,
            agentID: agentID,
            entryId: entryId)
    }

    static func forkSessionAtMessageRequest(
        sessionKey: String,
        agentID: String?,
        entryId: String) -> MangabaClawChatGatewayRequest
    {
        MangabaClawChatGatewayRequests.forkAtMessage(
            sessionKey: sessionKey,
            agentID: agentID,
            entryId: entryId)
    }
}
