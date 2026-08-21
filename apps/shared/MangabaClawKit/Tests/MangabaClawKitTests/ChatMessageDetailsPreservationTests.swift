import Foundation
import MangabaClawKit
import Testing
@testable import MangabaClawChatUI

/// Tool-result diff metadata rides on `MangabaClawChatMessage.details`; every
/// field-enumerating message rebuild must carry it or inline diffs silently
/// disappear after cache-warm reconciliation.
@Suite("ChatMessageDetailsPreservation")
struct ChatMessageDetailsPreservationTests {
    private func toolResultMessage(id: UUID = UUID()) -> MangabaClawChatMessage {
        MangabaClawChatMessage(
            id: id,
            role: "toolResult",
            content: [
                MangabaClawChatMessageContent(
                    type: "text",
                    text: "Successfully replaced 1 block(s).",
                    mimeType: nil,
                    fileName: nil,
                    content: nil),
            ],
            timestamp: 1,
            toolCallId: "call-1",
            toolName: "edit",
            details: AnyCodable(["diff": AnyCodable("+1 added\n-1 removed")]))
    }

    private func systemNoticeMessage(id: UUID = UUID()) -> MangabaClawChatMessage {
        MangabaClawChatMessage(
            id: id,
            role: "user",
            content: [
                MangabaClawChatMessageContent(
                    type: "text",
                    text: "[System] gateway restarted",
                    mimeType: nil,
                    fileName: nil,
                    content: nil),
            ],
            timestamp: 2,
            provenance: MangabaClawChatInputProvenance(
                kind: "internal_system",
                sourceTool: "restart-sentinel"))
    }

    @MainActor @Test func `decode pipeline keeps message details`() throws {
        let payloadData = try JSONEncoder().encode([self.toolResultMessage(), self.systemNoticeMessage()])
        let anyMessages = try JSONDecoder().decode([AnyCodable].self, from: payloadData)
        let decoded = MangabaClawChatViewModel.decodeMessages(anyMessages)

        #expect(decoded.first?.details != nil)
        #expect(decoded.last?.provenance?.sourceTool == "restart-sentinel")
    }

    @MainActor @Test func `canonical adoption keeps incoming details`() {
        let incoming = self.toolResultMessage()
        let existing = self.toolResultMessage()

        let adopted = MangabaClawChatViewModel.adoptingCanonicalMessage(incoming, over: existing)

        #expect(adopted.id == existing.id)
        #expect(adopted.details != nil)

        let incomingNotice = self.systemNoticeMessage()
        let adoptedNotice = MangabaClawChatViewModel.adoptingCanonicalMessage(
            incomingNotice,
            over: self.systemNoticeMessage())
        #expect(adoptedNotice.provenance == incomingNotice.provenance)
    }
}
