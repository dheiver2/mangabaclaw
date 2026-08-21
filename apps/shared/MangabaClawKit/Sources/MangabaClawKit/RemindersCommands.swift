import Foundation

public enum MangabaClawRemindersCommand: String, Codable, Sendable {
    case list = "reminders.list"
    case add = "reminders.add"
}

public enum MangabaClawReminderStatusFilter: String, Codable, Sendable {
    case incomplete
    case completed
    case all
}

public struct MangabaClawRemindersListParams: Codable, Sendable, Equatable {
    public var status: MangabaClawReminderStatusFilter?
    public var limit: Int?

    public init(status: MangabaClawReminderStatusFilter? = nil, limit: Int? = nil) {
        self.status = status
        self.limit = limit
    }
}

public struct MangabaClawRemindersAddParams: Codable, Sendable, Equatable {
    public var title: String
    public var dueISO: String?
    public var notes: String?
    public var listId: String?
    public var listName: String?

    public init(
        title: String,
        dueISO: String? = nil,
        notes: String? = nil,
        listId: String? = nil,
        listName: String? = nil)
    {
        self.title = title
        self.dueISO = dueISO
        self.notes = notes
        self.listId = listId
        self.listName = listName
    }
}

public struct MangabaClawReminderPayload: Codable, Sendable, Equatable {
    public var identifier: String
    public var title: String
    public var dueISO: String?
    public var completed: Bool
    public var listName: String?

    public init(
        identifier: String,
        title: String,
        dueISO: String? = nil,
        completed: Bool,
        listName: String? = nil)
    {
        self.identifier = identifier
        self.title = title
        self.dueISO = dueISO
        self.completed = completed
        self.listName = listName
    }
}

public struct MangabaClawRemindersListPayload: Codable, Sendable, Equatable {
    public var reminders: [MangabaClawReminderPayload]

    public init(reminders: [MangabaClawReminderPayload]) {
        self.reminders = reminders
    }
}

public struct MangabaClawRemindersAddPayload: Codable, Sendable, Equatable {
    public var reminder: MangabaClawReminderPayload

    public init(reminder: MangabaClawReminderPayload) {
        self.reminder = reminder
    }
}
