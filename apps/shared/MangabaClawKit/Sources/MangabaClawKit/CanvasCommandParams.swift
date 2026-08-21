import Foundation

public struct MangabaClawCanvasNavigateParams: Codable, Sendable, Equatable {
    public var url: String

    public init(url: String) {
        self.url = url
    }
}

public struct MangabaClawCanvasPlacement: Codable, Sendable, Equatable {
    public var x: Double?
    public var y: Double?
    public var width: Double?
    public var height: Double?
}

public struct MangabaClawCanvasPresentParams: Codable, Sendable, Equatable {
    public var url: String?
    public var placement: MangabaClawCanvasPlacement?

    public init(url: String? = nil, placement: MangabaClawCanvasPlacement? = nil) {
        self.url = url
        self.placement = placement
    }
}
