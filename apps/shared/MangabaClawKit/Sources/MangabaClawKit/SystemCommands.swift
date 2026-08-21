import Foundation

public enum MangabaClawSystemCommand: String, Codable, Sendable {
    case run = "system.run"
    case which = "system.which"
    case notify = "system.notify"
    case execApprovalsGet = "system.execApprovals.get"
    case execApprovalsSet = "system.execApprovals.set"
}

public enum MangabaClawFileSystemCommand: String, Codable, Sendable {
    case listDir = "fs.listDir"
}

public enum MangabaClawNotificationPriority: String, Codable, Sendable {
    case passive
    case active
    case timeSensitive
}

public enum MangabaClawNotificationDelivery: String, Codable, Sendable {
    case system
    case overlay
    case auto
}

public struct MangabaClawSystemNotifyParams: Codable, Sendable, Equatable {
    public var title: String
    public var body: String
    public var sound: String?
    public var priority: MangabaClawNotificationPriority?
    public var delivery: MangabaClawNotificationDelivery?

    public init(
        title: String,
        body: String,
        sound: String? = nil,
        priority: MangabaClawNotificationPriority? = nil,
        delivery: MangabaClawNotificationDelivery? = nil)
    {
        self.title = title
        self.body = body
        self.sound = sound
        self.priority = priority
        self.delivery = delivery
    }
}
