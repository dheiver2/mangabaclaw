import Darwin
import MangabaClawKit
import SwiftUI
import UIKit
import UserNotifications

enum SettingsRoute: Hashable {
    case gateway
    case systemAgent
    case appleWatch
    case approvals
    case permissions
    case channels
    case skills
    case voice
    case diagnostics
    case privacy
    case notifications
    case licenses
    case about
}

enum SettingsLayout {
    static let cardRadius: CGFloat = MangabaClawProMetric.cardRadius
    static let rowHeight: CGFloat = 58
}

/// Canonical label/value list row for Settings and Talk surfaces. Keep every
/// detail row on this view so row typography cannot drift between sections;
/// plain `LabeledContent(String, value:)` renders unbranded system fonts.
struct SettingsDetailRow: View {
    let label: LocalizedStringKey
    let value: MangabaClawTextValue

    init(_ label: LocalizedStringKey, value: MangabaClawTextValue) {
        self.label = label
        self.value = value
    }

    var body: some View {
        LabeledContent {
            self.value.text
                .font(MangabaClawType.subhead)
                .lineLimit(1)
                .truncationMode(.middle)
        } label: {
            Text(self.label)
                .font(MangabaClawType.body)
        }
    }
}

struct SettingsBuildMetadataStrip: View {
    let metadata: ArtifactBuildInfo
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.layoutDirection) private var layoutDirection

    private struct Field: Identifiable {
        enum ID: String {
            case version
            case commit
            case built
        }

        let id: ID
        let title: LocalizedStringKey
        let value: String?
        let forceLeftToRight: Bool
    }

    private var fields: [Field] {
        [
            Field(id: .version, title: "Version", value: self.metadata.versionDisplay, forceLeftToRight: true),
            Field(id: .commit, title: "Commit", value: self.metadata.shortCommit, forceLeftToRight: true),
            Field(id: .built, title: "Built", value: self.metadata.localizedBuildDate(), forceLeftToRight: false),
        ]
    }

    var body: some View {
        Group {
            if self.dynamicTypeSize.isAccessibilitySize {
                self.metadataColumn
            } else {
                ViewThatFits(in: .horizontal) {
                    self.metadataRow
                    self.metadataColumn
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .foregroundStyle(.secondary)
        .textSelection(.enabled)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(self.metadataAccessibilityLabel)
        .accessibilityActions {
            if self.metadata.gitCommit != nil {
                Button {
                    self.copyCommit()
                } label: {
                    Text("Copy full commit hash")
                        .font(MangabaClawType.subheadSemiBold)
                }
            }
            Button {
                self.copyBuildInfo()
            } label: {
                Text("Copy build info")
                    .font(MangabaClawType.subheadSemiBold)
            }
        }
        .contextMenu {
            if self.metadata.gitCommit != nil {
                Button {
                    self.copyCommit()
                } label: {
                    Label {
                        Text("Copy Commit")
                            .font(MangabaClawType.subheadSemiBold)
                    } icon: {
                        Image(systemName: "number")
                    }
                }
            }
            Button {
                self.copyBuildInfo()
            } label: {
                Label {
                    Text("Copy Build Info")
                        .font(MangabaClawType.subheadSemiBold)
                } icon: {
                    Image(systemName: "doc.on.doc")
                }
            }
        }
    }

    private var metadataRow: some View {
        HStack(alignment: .center, spacing: 0) {
            ForEach(Array(self.fields.enumerated()), id: \.element.id) { index, field in
                if index > 0 {
                    Divider()
                        .frame(height: 30)
                }
                self.metadataField(field, alignment: .center)
                    .frame(minWidth: 72, maxWidth: .infinity)
                    .padding(.horizontal, 4)
            }
        }
        .frame(minWidth: 240)
    }

    private var metadataColumn: some View {
        VStack(alignment: .center, spacing: 8) {
            ForEach(self.fields) { field in
                self.metadataField(field, alignment: .center)
            }
        }
    }

    private func metadataField(_ field: Field, alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 1) {
            Text(field.title)
                .font(MangabaClawType.caption2SemiBold)
                .textCase(.uppercase)
            Group {
                if let value = field.value {
                    Text(verbatim: value)
                } else {
                    Text("Unavailable")
                }
            }
            .font(MangabaClawType.monoSmall)
            .lineLimit(1)
            .minimumScaleFactor(0.72)
            .environment(
                \.layoutDirection,
                field.forceLeftToRight ? .leftToRight : self.layoutDirection)
        }
    }

    private var metadataAccessibilityLabel: String {
        let version = self.metadata.versionDisplay
        let commit = self.metadata.spokenCommit
        let timestamp = self.metadata.buildTimestamp
        let built = self.metadata.localizedBuildDate() ?? timestamp
        if let commit, let timestamp, let built {
            return String(
                format: String(
                    localized: "Version %1$@, commit %2$@, built %3$@, timestamp %4$@"),
                version,
                commit,
                built,
                timestamp)
        }
        if let commit {
            return String(
                format: String(
                    localized: "Version %1$@, commit %2$@, build date unavailable"),
                version,
                commit)
        }
        if let timestamp, let built {
            return String(
                format: String(
                    localized: "Version %1$@, commit unavailable, built %2$@, timestamp %3$@"),
                version,
                built,
                timestamp)
        }
        return String(
            format: String(
                localized: "Version %@, commit unavailable, build date unavailable"),
            version)
    }

    private func copyCommit() {
        guard let gitCommit = self.metadata.gitCommit else { return }
        UIPasteboard.general.string = gitCommit
    }

    private func copyBuildInfo() {
        UIPasteboard.general.string = self.metadata.copyText
    }
}

struct SettingsApprovalItem: Identifiable {
    let id: String
    let icon: String
    let title: MangabaClawTextValue
    let detail: MangabaClawTextValue
    let priority: MangabaClawTextValue
    let color: Color
}

struct SettingsApprovalRow: View {
    let item: SettingsApprovalItem

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: self.item.icon)
                .font(MangabaClawType.captionBold)
                .foregroundStyle(.white)
                .frame(width: 30, height: 30)
                .background {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(self.item.color)
                }
            VStack(alignment: .leading, spacing: 2) {
                self.item.title.text
                    .font(MangabaClawType.subheadSemiBold)
                    .lineLimit(1)
                self.item.detail.text
                    .font(MangabaClawType.caption2Medium)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            self.item.priority.text
                .font(MangabaClawType.captionBold)
                .foregroundStyle(self.item.color)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background {
                    Capsule()
                        .fill(self.item.color.opacity(0.10))
                }
        }
        .padding(.vertical, 7)
    }
}

enum SettingsNotificationStatus: Equatable {
    case checking
    case allowed
    case notAllowed
    case notSet
    case unknown

    init(_ status: UNAuthorizationStatus) {
        switch status {
        case .authorized, .provisional, .ephemeral:
            self = .allowed
        case .denied:
            self = .notAllowed
        case .notDetermined:
            self = .notSet
        @unknown default:
            self = .unknown
        }
    }

    var allowsNotifications: Bool {
        self == .allowed
    }
}

enum SettingsNotificationPresentation: Equatable {
    case checking
    case enabled
    case off
    case setup
    case denied
    case notSet
    case unknown

    var text: String {
        switch self {
        case .checking: String(localized: "Checking")
        case .enabled: String(localized: "Enabled")
        case .off: String(localized: "Off")
        case .setup: String(localized: "Setup")
        case .denied: String(localized: "Denied")
        case .notSet: String(localized: "Not Enabled")
        case .unknown: String(localized: "Unknown")
        }
    }

    var detail: String {
        switch self {
        case .checking:
            String(localized: "Checking iOS notification permission.")
        case .enabled:
            String(
                localized: "MangabaClaw can show approval prompts and event alerts when the app is not active.")
        case .off:
            String(localized: "MangabaClaw notifications are off.")
        case .setup:
            String(
                localized: "Finish notification setup to receive alerts when the app is not active.")
        case .denied:
            String(localized: "Notifications have been denied. Enable them in iOS Settings.")
        case .notSet:
            String(
                localized: "Enable notifications to receive approval prompts and event alerts outside the app.")
        case .unknown:
            String(localized: "MangabaClaw cannot determine the current notification permission state.")
        }
    }

    var color: Color {
        switch self {
        case .enabled:
            MangabaClawBrand.ok
        case .denied, .setup, .unknown:
            MangabaClawBrand.warn
        case .checking, .notSet, .off:
            .secondary
        }
    }

    var isActive: Bool {
        self == .enabled
    }

    var needsAttention: Bool {
        self != .checking && self != .enabled
    }
}

enum SettingsDiagnosticIssue: String, Equatable, CaseIterable {
    case gatewayOffline
    case discoveryUnavailable
    case talkConfigMissing
    case notificationsUnavailable
}

enum SettingsDiagnostics {
    static func issues(
        gatewayConnected: Bool,
        discoveredGatewayCount: Int,
        talkConfigLoaded: Bool,
        notificationsAllowed: Bool) -> [SettingsDiagnosticIssue]
    {
        var issues: [SettingsDiagnosticIssue] = []
        if !gatewayConnected { issues.append(.gatewayOffline) }
        if discoveredGatewayCount == 0 { issues.append(.discoveryUnavailable) }
        if gatewayConnected, !talkConfigLoaded { issues.append(.talkConfigMissing) }
        if !notificationsAllowed { issues.append(.notificationsUnavailable) }
        return issues
    }

    static func issueCount(
        gatewayConnected: Bool,
        discoveredGatewayCount: Int,
        talkConfigLoaded: Bool,
        notificationsAllowed: Bool) -> Int
    {
        self.issues(
            gatewayConnected: gatewayConnected,
            discoveredGatewayCount: discoveredGatewayCount,
            talkConfigLoaded: talkConfigLoaded,
            notificationsAllowed: notificationsAllowed).count
    }

    static func timestamp(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }
}

extension SettingsProTab {
    static func hasTailnetIPv4() -> Bool {
        var addrList: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&addrList) == 0, let first = addrList else { return false }
        defer { freeifaddrs(addrList) }
        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let flags = Int32(ptr.pointee.ifa_flags)
            let isUp = (flags & IFF_UP) != 0
            let isLoopback = (flags & IFF_LOOPBACK) != 0
            guard let addrPtr = ptr.pointee.ifa_addr else { continue }
            let family = addrPtr.pointee.sa_family
            if !isUp || isLoopback || family != UInt8(AF_INET) { continue }
            var addr = addrPtr.pointee
            var buffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            let result = getnameinfo(
                &addr,
                socklen_t(addrPtr.pointee.sa_len),
                &buffer,
                socklen_t(buffer.count),
                nil,
                0,
                NI_NUMERICHOST)
            guard result == 0 else { continue }
            let bytes = buffer.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }
            guard let ip = String(bytes: bytes, encoding: .utf8) else { continue }
            if self.isTailnetIPv4(ip) { return true }
        }
        return false
    }

    static func isTailnetHostOrIP(_ host: String) -> Bool {
        let trimmed = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if trimmed.hasSuffix(".ts.net") || trimmed.hasSuffix(".ts.net.") { return true }
        return self.isTailnetIPv4(trimmed)
    }

    static func isTailnetIPv4(_ ip: String) -> Bool {
        let parts = ip.split(separator: ".")
        guard parts.count == 4 else { return false }
        let octets = parts.compactMap { Int($0) }
        guard octets.count == 4 else { return false }
        let a = octets[0]
        let b = octets[1]
        guard (0...255).contains(a), (0...255).contains(b) else { return false }
        return a == 100 && b >= 64 && b <= 127
    }
}

#if DEBUG
#Preview("Gateway settings states") {
    SettingsGatewayStatesPreview()
}

private struct SettingsGatewayStatesPreview: View {
    var body: some View {
        ZStack {
            MangabaClawProBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    self.stateSection("Connected") {
                        self.gatewayStatusCard(
                            title: "Gateway online",
                            detail: "Connected to mangabaclaw-gateway.tailnet.ts.net.",
                            value: "online",
                            color: MangabaClawBrand.ok)
                        self.gatewayFactsCard(
                            address: "100.88.41.20:18789",
                            server: "mangabaclaw-gateway",
                            discovered: "3",
                            agent: "Aiden")
                    }

                    self.stateSection("Loading") {
                        self.gatewayStatusCard(
                            title: "Checking gateway",
                            detail: "Refreshing connection, discovery, and device trust state.",
                            value: "loading",
                            color: MangabaClawBrand.accent)
                        self.gatewayActionsCard(isBusy: true)
                    }

                    self.stateSection("Empty") {
                        self.gatewayStatusCard(
                            title: "No gateway configured",
                            detail: "Scan a setup QR code, paste a setup code, or choose a discovered gateway.",
                            value: "setup",
                            color: .secondary)
                        self.setupActionsCard
                    }

                    self.stateSection("Error") {
                        self.gatewayStatusCard(
                            title: "Tailscale warning",
                            detail: "Tailscale is off on this device. Turn it on, then try again.",
                            value: "network",
                            color: MangabaClawBrand.warn)
                    }
                }
                .padding(.horizontal, MangabaClawProMetric.pagePadding)
                .padding(.vertical, 18)
            }
        }
    }

    private func stateSection(
        _ title: String,
        @ViewBuilder content: () -> some View) -> some View
    {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(MangabaClawType.subheadSemiBold)
                .foregroundStyle(.secondary)
            content()
        }
    }

    private func gatewayStatusCard(
        title: String,
        detail: String,
        value: String,
        color: Color) -> some View
    {
        ProCard(padding: 0, radius: SettingsLayout.cardRadius) {
            ProStatusRow(
                icon: value == "online" ? "antenna.radiowaves.left.and.right" : "wifi.slash",
                title: .localized(title),
                detail: .localized(detail),
                value: value,
                color: color,
                actionTitle: value == "setup" ? "Scan QR" : nil,
                action: value == "setup" ? {} : nil)
        }
    }

    private func gatewayFactsCard(
        address: String,
        server: String,
        discovered: String,
        agent: String) -> some View
    {
        ProCard(radius: SettingsLayout.cardRadius) {
            VStack(spacing: 0) {
                self.factRow("Address", value: address)
                Divider()
                self.factRow("Server", value: server)
                Divider()
                self.factRow("Discovered", value: discovered)
                Divider()
                self.factRow("Default Agent", value: agent)
            }
        }
    }

    private func factRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(MangabaClawType.caption)
                .foregroundStyle(.secondary)
            Spacer(minLength: 8)
            Text(value)
                .font(MangabaClawType.captionMedium)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .frame(height: SettingsLayout.rowHeight)
    }

    private func gatewayActionsCard(isBusy: Bool) -> some View {
        ProCard(radius: SettingsLayout.cardRadius) {
            HStack(spacing: 10) {
                self.previewButton("Reconnect", systemImage: "arrow.triangle.2.circlepath", isBusy: isBusy)
                self.previewButton("Diagnose", systemImage: "cross.case", isBusy: isBusy)
            }
        }
    }

    private var setupActionsCard: some View {
        ProCard(radius: SettingsLayout.cardRadius) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    self.previewButton("Scan QR", systemImage: "qrcode.viewfinder", isBusy: false)
                    self.previewButton("Connect", systemImage: "link", isBusy: false)
                }
                Text("Discovered gateways and manual setup live here when the gateway has not connected yet.")
                    .font(MangabaClawType.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func previewButton(
        _ title: String,
        systemImage: String,
        isBusy: Bool) -> some View
    {
        Button {} label: {
            Label(title, systemImage: systemImage)
                .font(MangabaClawType.captionSemiBold)
                .frame(maxWidth: .infinity)
        }
        .font(MangabaClawType.captionSemiBold)
        .buttonStyle(.bordered)
        .controlSize(.small)
        .disabled(isBusy)
    }
}
#endif
