import Foundation
@testable import MangabaClawChatUI
import MangabaClawKit
import Testing

struct ChatEventTextTests {
    @Test func `decodes v3 and v4 chat delta payloads`() throws {
        let payloads = [
            #"{"runId":"run-v3","sessionKey":"main","state":"delta","message":{"role":"assistant","content":[{"type":"text","text":"v3 reply"}]}}"#,
            #"{"runId":"run-v4","sessionKey":"main","state":"delta","deltaText":"reply","message":{"role":"assistant","content":[{"type":"text","text":"v4 reply"}]}}"#,
        ]

        let decoded = try payloads.map { payload in
            try JSONDecoder().decode(MangabaClawChatEventPayload.self, from: Data(payload.utf8))
        }

        #expect(
            decoded.map { MangabaClawChatEventText.assistantText(from: $0) } ==
                ["v3 reply", "v4 reply"]
        )
    }

    @Test func `extracts assistant text from final chat event message`() {
        let event = MangabaClawChatEventPayload(
            runId: "run-1",
            sessionKey: "main",
            state: "final",
            message: AnyCodable([
                "role": "assistant",
                "content": [
                    ["type": "text", "text": "hello"],
                    ["type": "text", "text": "world"],
                ],
            ]),
            errorMessage: nil
        )

        #expect(MangabaClawChatEventText.assistantText(from: event) == "hello\nworld")
    }

    @Test func `keeps responses text and ignores typed non text blocks`() {
        let event = MangabaClawChatEventPayload(
            runId: "run-mixed",
            sessionKey: "main",
            state: "final",
            message: AnyCodable([
                "role": "assistant",
                "content": [
                    ["type": "thinking", "text": "private reasoning"],
                    ["type": "output_text", "text": "visible output"],
                    ["type": "input_text", "text": "visible input"],
                    ["type": "tool_result", "text": "tool payload"],
                    ["type": "image", "text": "image caption"],
                    ["text": "legacy visible"],
                ],
            ]),
            errorMessage: nil
        )

        #expect(
            MangabaClawChatEventText.assistantText(from: event) ==
                "visible output\nvisible input\nlegacy visible"
        )
    }

    @Test func `returns nil for typed non text content`() {
        let event = MangabaClawChatEventPayload(
            runId: "run-non-text",
            sessionKey: "main",
            state: "delta",
            message: AnyCodable([
                "role": "assistant",
                "content": [
                    ["type": "thinking", "text": "private reasoning"],
                    ["type": "tool_result", "text": "tool payload"],
                ],
            ]),
            errorMessage: nil
        )

        #expect(MangabaClawChatEventText.assistantText(from: event) == nil)
    }

    @Test func `ignores user messages`() {
        let event = MangabaClawChatEventPayload(
            runId: "run-1",
            sessionKey: "main",
            state: "delta",
            message: AnyCodable([
                "role": "user",
                "content": [["type": "text", "text": "ignore me"]],
            ]),
            errorMessage: nil
        )

        #expect(MangabaClawChatEventText.assistantText(from: event) == nil)
    }

    @Test func `extracts plain string content`() {
        let event = MangabaClawChatEventPayload(
            runId: "run-1",
            sessionKey: "main",
            state: "final",
            message: AnyCodable([
                "role": "assistant",
                "content": "plain reply",
            ]),
            errorMessage: nil
        )

        #expect(MangabaClawChatEventText.assistantText(from: event) == "plain reply")
    }
}
