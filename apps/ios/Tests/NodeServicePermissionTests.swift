import Contacts
import EventKit
import MangabaClawKit
import Testing
@testable import MangabaClaw

@Suite struct NodeServicePermissionTests {
    @Test func `calendar events do not request access from node invoke`() async throws {
        let service = CalendarService(eventAuthorizationStatus: { .notDetermined })

        await expectPermissionError(
            code: "CALENDAR_PERMISSION_REQUIRED",
            performing: {
                _ = try await service.events(params: MangabaClawCalendarEventsParams())
            })
    }

    @Test func `calendar add does not request access from node invoke`() async throws {
        let service = CalendarService(eventAuthorizationStatus: { .notDetermined })

        await expectPermissionError(
            code: "CALENDAR_PERMISSION_REQUIRED",
            performing: {
                _ = try await service.add(params: calendarAddParams())
            })
    }

    @Test func `reminders list does not request access from node invoke`() async throws {
        let service = RemindersService(reminderAuthorizationStatus: { .notDetermined })

        await expectPermissionError(
            code: "REMINDERS_PERMISSION_REQUIRED",
            performing: {
                _ = try await service.list(params: MangabaClawRemindersListParams())
            })
    }

    @Test func `reminders add does not request access from node invoke`() async throws {
        let service = RemindersService(reminderAuthorizationStatus: { .notDetermined })

        await expectPermissionError(
            code: "REMINDERS_PERMISSION_REQUIRED",
            performing: {
                _ = try await service.add(params: MangabaClawRemindersAddParams(title: "Follow up"))
            })
    }

    @Test func `contacts search does not request access from node invoke`() async throws {
        let service = ContactsService(authorizationStatus: { .notDetermined })

        await expectPermissionError(
            code: "CONTACTS_PERMISSION_REQUIRED",
            performing: {
                _ = try await service.search(params: MangabaClawContactsSearchParams(query: "Ada"))
            })
    }

    @Test func `contacts add does not request access from node invoke`() async throws {
        let service = ContactsService(authorizationStatus: { .notDetermined })

        await expectPermissionError(
            code: "CONTACTS_PERMISSION_REQUIRED",
            performing: {
                _ = try await service.add(params: MangabaClawContactsAddParams(givenName: "Ada"))
            })
    }
}

private func calendarAddParams() -> MangabaClawCalendarAddParams {
    MangabaClawCalendarAddParams(
        title: "Review",
        startISO: "2026-07-03T09:00:00Z",
        endISO: "2026-07-03T09:30:00Z")
}

private func expectPermissionError(
    code: String,
    performing operation: () async throws -> Void) async
{
    do {
        try await operation()
        Issue.record("Expected \(code)")
    } catch {
        #expect(error.localizedDescription.contains(code))
    }
}
