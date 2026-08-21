import Foundation

public enum MangabaClawCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
    case ptzStatus = "camera.ptz.status"
    case ptzControl = "camera.ptz.control"
}

public enum MangabaClawCameraPTZOperation: String, Codable, Sendable {
    case set
    case move
    case home
}

public struct MangabaClawCameraPTZAxisValues: Codable, Sendable, Equatable {
    public var panDegrees: Double?
    public var tiltDegrees: Double?
    public var zoomPercent: Double?

    public init(
        panDegrees: Double? = nil,
        tiltDegrees: Double? = nil,
        zoomPercent: Double? = nil)
    {
        self.panDegrees = panDegrees
        self.tiltDegrees = tiltDegrees
        self.zoomPercent = zoomPercent
    }
}

public struct MangabaClawCameraPTZStatusParams: Codable, Sendable, Equatable {
    public var deviceId: String

    public init(deviceId: String) {
        self.deviceId = deviceId
    }
}

public struct MangabaClawCameraPTZControlParams: Codable, Sendable, Equatable {
    public var deviceId: String
    public var operation: MangabaClawCameraPTZOperation
    public var target: MangabaClawCameraPTZAxisValues?
    public var delta: MangabaClawCameraPTZAxisValues?

    public init(
        deviceId: String,
        operation: MangabaClawCameraPTZOperation,
        target: MangabaClawCameraPTZAxisValues? = nil,
        delta: MangabaClawCameraPTZAxisValues? = nil)
    {
        self.deviceId = deviceId
        self.operation = operation
        self.target = target
        self.delta = delta
    }
}

public enum MangabaClawCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum MangabaClawCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum MangabaClawCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct MangabaClawCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: MangabaClawCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: MangabaClawCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: MangabaClawCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: MangabaClawCameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct MangabaClawCameraClipParams: Codable, Sendable, Equatable {
    public var facing: MangabaClawCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: MangabaClawCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: MangabaClawCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: MangabaClawCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
