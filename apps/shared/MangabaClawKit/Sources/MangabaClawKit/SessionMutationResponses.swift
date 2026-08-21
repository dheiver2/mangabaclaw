import Foundation

public struct MangabaClawSessionsCompactResponse: Decodable, Sendable {
    public let ok: Bool
    public let reason: String?

    public static func requireSuccess(from data: Data) throws {
        let response = try JSONDecoder().decode(Self.self, from: data)
        guard response.ok else {
            throw MangabaClawSessionsCompactError(reason: response.reason)
        }
    }
}

struct MangabaClawSessionsCompactError: Error, LocalizedError, Sendable {
    let reason: String?

    var errorDescription: String? {
        let detail = self.reason?.trimmingCharacters(in: .whitespacesAndNewlines)
        return detail?.isEmpty == false ? detail : "Thread compaction failed"
    }
}
