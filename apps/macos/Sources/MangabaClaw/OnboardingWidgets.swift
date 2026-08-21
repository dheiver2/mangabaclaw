import MangabaClawChatUI
import SwiftUI

/// Onboarding hero mascot with the mangabaclaw.ai hero treatment: the animated
/// mascot plus its coral silhouette glow (drop-shadow at ~10% of size).
/// Interactive: it reacts to clicks and its eyes follow the pointer.
struct GlowingMangabaClawIcon: View {
    @Environment(\.colorScheme) private var colorScheme

    let size: CGFloat
    let mood: MangabaClawMascotMood
    let accessory: MangabaClawMascotAccessory

    init(
        size: CGFloat = 148,
        mood: MangabaClawMascotMood = .idle,
        accessory: MangabaClawMascotAccessory = .none)
    {
        self.size = size
        self.mood = mood
        self.accessory = accessory
    }

    var body: some View {
        // The large vector hero is decorative; 30 fps burns a core while setup sits idle.
        MangabaClawMascotView(
            mood: self.mood,
            accessory: self.accessory,
            interactive: true,
            minimumFrameInterval: 1.0 / 12.0)
            .frame(width: self.size, height: self.size)
            .shadow(
                color: MangabaClawMascotView.heroGlowColor(for: self.colorScheme),
                radius: self.size * 0.1)
    }
}

extension OnboardingView {
    /// Onboarding page classes the mascot reacts to.
    enum MascotPage {
        case welcome
        case connection
        case cli
        case ai
        case ready
    }

    /// Flow state the mascot mood is derived from.
    struct MascotMoodSnapshot {
        var page: MascotPage
        var installingCLI = false
        var cliInstalled = false
        var cliStatusKnown = false
        var aiPhase: OnboardingAISetupModel.Phase = .idle
        var aiBusy = false
        var aiFailed = false
        var remoteProbeState: RemoteOnboardingProbeState = .idle
    }

    /// The hero mascot mirrors what setup is doing: curious while choosing,
    /// hard-hat working while setup is in flight, sad on failures,
    /// celebrating once the AI answers and on the final page.
    var mascotMood: MangabaClawMascotMood {
        Self.mascotMood(for: MascotMoodSnapshot(
            page: self.mascotPage,
            installingCLI: self.installingCLI,
            cliInstalled: self.cliInstalled,
            cliStatusKnown: self.cliStatusKnown,
            aiPhase: self.aiSetup.phase,
            aiBusy: self.aiSetup.isBusy,
            aiFailed: Self.aiSetupLooksFailed(self.aiSetup),
            remoteProbeState: self.remoteProbeState))
    }

    var mascotAccessory: MangabaClawMascotAccessory {
        Self.mascotAccessory(for: self.mascotPage)
    }

    private var mascotPage: MascotPage {
        switch self.activePageIndex {
        case self.connectionPageIndex: .connection
        case self.cliPageIndex: .cli
        case self.aiPageIndex: .ai
        case self.readyPageIndex: .ready
        default: .welcome
        }
    }

    static func aiSetupLooksFailed(_ aiSetup: OnboardingAISetupModel) -> Bool {
        guard !aiSetup.connected else { return false }
        let candidateFailed = aiSetup.statuses.values.contains { status in
            if case .failed = status { return true }
            return false
        }
        return aiSetup.detectError != nil ||
            aiSetup.configuredGatewayAuthIssue != nil ||
            aiSetup.exhaustedAutoCandidates ||
            aiSetup.manualError != nil ||
            candidateFailed
    }

    static func mascotMood(for snapshot: MascotMoodSnapshot) -> MangabaClawMascotMood {
        switch snapshot.page {
        case .welcome:
            .idle
        case .connection:
            switch snapshot.remoteProbeState {
            case .checking: .thinking
            case .failed: .sad
            case .ok: .happy
            case .idle: .curious
            }
        case .cli:
            if snapshot.cliInstalled {
                .happy
            } else if snapshot.cliStatusKnown, !snapshot.installingCLI {
                // Mirrors the page's install-failed card.
                .sad
            } else {
                .working
            }
        case .ai:
            if snapshot.aiPhase == .connected {
                .celebrating
            } else if snapshot.aiBusy {
                .thinking
            } else if snapshot.aiFailed {
                .sad
            } else {
                .curious
            }
        case .ready:
            .celebrating
        }
    }

    static func mascotAccessory(for page: MascotPage) -> MangabaClawMascotAccessory {
        switch page {
        case .ready: .gradCap
        case .welcome, .connection, .cli, .ai: .none
        }
    }
}
