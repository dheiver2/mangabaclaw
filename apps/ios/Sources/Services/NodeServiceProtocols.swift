import CoreLocation
import Foundation
import MangabaClawKit
import UIKit

typealias MangabaClawCameraSnapResult = (format: String, base64: String, width: Int, height: Int)
typealias MangabaClawCameraClipResult = (format: String, base64: String, durationMs: Int, hasAudio: Bool)

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(
        params: MangabaClawCameraSnapParams,
        defaultFacing: MangabaClawCameraFacing) async throws -> MangabaClawCameraSnapResult
    func clip(
        params: MangabaClawCameraClipParams,
        defaultFacing: MangabaClawCameraFacing) async throws -> MangabaClawCameraClipResult
}

protocol ScreenRecordingServicing: Sendable {
    func record(
        screenIndex: Int?,
        durationMs: Int?,
        fps: Double?,
        includeAudio: Bool?,
        outPath: String?) async throws -> String
}

@MainActor
protocol LocationServicing: Sendable {
    func authorizationStatus() -> CLAuthorizationStatus
    func accuracyAuthorization() -> CLAccuracyAuthorization
    func authorizationSnapshot() -> LocationAuthorizationSnapshot
    func ensureAuthorization(mode: MangabaClawLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: MangabaClawLocationGetParams,
        desiredAccuracy: MangabaClawLocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
    func setBackgroundLocationUpdatesEnabled(_ enabled: Bool)
    func setAuthorizationChangeHandler(
        _ handler: @escaping @MainActor @Sendable (LocationAuthorizationSnapshot) -> Void)
    func startMonitoringSignificantLocationChanges(onUpdate: @escaping @Sendable (CLLocation) -> Void)
    func stopMonitoringSignificantLocationChanges()
}

extension LocationServicing {
    func authorizationSnapshot() -> LocationAuthorizationSnapshot {
        LocationAuthorizationSnapshot(
            authorizationStatus: self.authorizationStatus(),
            accuracyAuthorization: self.accuracyAuthorization())
    }
}

@MainActor
protocol DeviceStatusServicing: Sendable {
    func status() async throws -> MangabaClawDeviceStatusPayload
    func info() -> MangabaClawDeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: MangabaClawPhotosLatestParams) async throws -> MangabaClawPhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: MangabaClawContactsSearchParams) async throws -> MangabaClawContactsSearchPayload
    func add(params: MangabaClawContactsAddParams) async throws -> MangabaClawContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: MangabaClawCalendarEventsParams) async throws -> MangabaClawCalendarEventsPayload
    func add(params: MangabaClawCalendarAddParams) async throws -> MangabaClawCalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: MangabaClawRemindersListParams) async throws -> MangabaClawRemindersListPayload
    func add(params: MangabaClawRemindersAddParams) async throws -> MangabaClawRemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: MangabaClawMotionActivityParams) async throws -> MangabaClawMotionActivityPayload
    func pedometer(params: MangabaClawPedometerParams) async throws -> MangabaClawPedometerPayload
}

struct WatchMessagingStatus: Equatable {
    var supported: Bool
    var paired: Bool
    var appInstalled: Bool
    var reachable: Bool
    var activationState: String
}

struct WatchQuickReplyEvent: Codable, Equatable {
    var replyId: String
    var promptId: String
    var actionId: String
    var actionLabel: String?
    var sessionKey: String?
    var gatewayStableID: String?
    var note: String?
    var sentAtMs: Int64?
    var transport: String
}

enum WatchMessageKind: String, Codable, Equatable {
    case chat
    case quickReply
}

struct WatchExecApprovalResolveEvent: Codable, Equatable {
    var replyId: String
    var approvalId: String
    var gatewayStableID: String?
    var decision: MangabaClawWatchExecApprovalDecision
    var sentAtMs: Int64?
    var transport: String
}

struct WatchExecApprovalSnapshotRequestItem: Equatable {
    var approvalId: String
    var activeResolutionAttemptId: String?
}

struct WatchExecApprovalSnapshotRequestEvent: Equatable {
    var requestId: String
    var gatewayStableID: String?
    var heldApprovals: [WatchExecApprovalSnapshotRequestItem]
    var sentAtMs: Int64?
    var transport: String

    init(
        requestId: String,
        gatewayStableID: String? = nil,
        heldApprovals: [WatchExecApprovalSnapshotRequestItem] = [],
        sentAtMs: Int64?,
        transport: String)
    {
        self.requestId = requestId
        self.gatewayStableID = gatewayStableID
        self.heldApprovals = heldApprovals
        self.sentAtMs = sentAtMs
        self.transport = transport
    }
}

struct WatchAppSnapshotRequestEvent: Equatable {
    var requestId: String
    var sentAtMs: Int64?
    var transport: String
}

struct WatchAppCommandEvent: Codable, Equatable {
    var commandId: String
    var command: MangabaClawWatchAppCommand
    var sessionKey: String?
    var gatewayStableID: String?
    var text: String?
    var sentAtMs: Int64?
    var transport: String
    var messageKind: WatchMessageKind?
}

struct WatchNotificationSendResult: Equatable {
    var deliveredImmediately: Bool
    var queuedForDelivery: Bool
    var transport: String
}

protocol WatchMessagingServicing: AnyObject, Sendable {
    func status() async -> WatchMessagingStatus
    func setStatusHandler(_ handler: (@Sendable (WatchMessagingStatus) -> Void)?)
    func setReplyHandler(_ handler: (@Sendable (WatchQuickReplyEvent) -> Void)?)
    func setExecApprovalResolveHandler(_ handler: (@Sendable (WatchExecApprovalResolveEvent) -> Void)?)
    func setExecApprovalSnapshotRequestHandler(
        _ handler: (@Sendable (WatchExecApprovalSnapshotRequestEvent) -> Void)?)
    func setAppSnapshotRequestHandler(_ handler: (@Sendable (WatchAppSnapshotRequestEvent) -> Void)?)
    func setAppCommandHandler(_ handler: (@Sendable (WatchAppCommandEvent) -> Void)?)
    func sendDirectNodeSetup(setupCode: String) async throws -> WatchNotificationSendResult
    func sendNotification(
        id: String,
        params: MangabaClawWatchNotifyParams,
        gatewayStableID: String?) async throws -> WatchNotificationSendResult
    func sendExecApprovalPrompt(
        _ message: MangabaClawWatchExecApprovalPromptMessage) async throws -> WatchNotificationSendResult
    func sendExecApprovalResolved(
        _ message: MangabaClawWatchExecApprovalResolvedMessage) async throws -> WatchNotificationSendResult
    func sendExecApprovalExpired(
        _ message: MangabaClawWatchExecApprovalExpiredMessage) async throws -> WatchNotificationSendResult
    func syncExecApprovalSnapshot(
        _ message: MangabaClawWatchExecApprovalSnapshotMessage) async throws -> WatchNotificationSendResult
    func syncAppSnapshot(
        _ message: MangabaClawWatchAppSnapshotMessage) async throws -> WatchNotificationSendResult
    func sendChatCompletion(
        _ message: MangabaClawWatchChatCompletionMessage) async throws -> WatchNotificationSendResult
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
