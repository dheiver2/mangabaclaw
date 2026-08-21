import Foundation
import Testing
@testable import MangabaClawKit

struct HealthCommandsTests {
    @Test func `health summary periods use the node command wire values`() throws {
        #expect(MangabaClawHealthCommand.summary.rawValue == "health.summary")
        #expect(MangabaClawHealthSummaryPeriod.allCases.map(\.rawValue) == ["today"])

        let params = MangabaClawHealthSummaryParams(period: .today)
        let data = try JSONEncoder().encode(params)
        #expect(String(decoding: data, as: UTF8.self) == #"{"period":"today"}"#)
    }
}
