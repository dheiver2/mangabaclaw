import Foundation

// Stable identifier used for both the macOS LaunchAgent label and Nix-managed defaults suite.
// nix-mangabaclaw writes app defaults into this suite to survive app bundle identifier churn.
let launchdLabel = "ai.mangabaclaw.mac"
var gatewayLaunchdLabel: String {
    AppProfile.current.gatewayLaunchAgentLabel
}

let nodeLaunchdLabel = "ai.mangabaclaw.node"
let onboardingVersionKey = "mangabaclaw.onboardingVersion"
let onboardingSeenKey = "mangabaclaw.onboardingSeen"
let onboardingSystemAgentPendingKey = "mangabaclaw.onboardingSystemAgentPending"
// Pre-rename releases persisted pending activations under the Crestodian key.
let onboardingSystemAgentPendingRetiredKey = "mangabaclaw.onboardingCrestodianPending"
let currentOnboardingVersion = 8
let pauseDefaultsKey = "mangabaclaw.pauseEnabled"
let iconAnimationsEnabledKey = "mangabaclaw.iconAnimationsEnabled"
let swabbleEnabledKey = "mangabaclaw.swabbleEnabled"
let swabbleTriggersKey = "mangabaclaw.swabbleTriggers"
let voiceWakeTriggerChimeKey = "mangabaclaw.voiceWakeTriggerChime"
let voiceWakeSendChimeKey = "mangabaclaw.voiceWakeSendChime"
let showDockIconKey = "mangabaclaw.showDockIcon"
let defaultVoiceWakeTriggers = ["mangabaclaw"]
let voiceWakeMaxWords = 32
let voiceWakeMaxWordLength = 64
let voiceWakeMicKey = "mangabaclaw.voiceWakeMicID"
let voiceWakeMicNameKey = "mangabaclaw.voiceWakeMicName"
let voiceWakeLocaleKey = "mangabaclaw.voiceWakeLocaleID"
let voiceWakeAdditionalLocalesKey = "mangabaclaw.voiceWakeAdditionalLocaleIDs"
let voicePushToTalkEnabledKey = "mangabaclaw.voicePushToTalkEnabled"
let voiceWakeTriggersTalkModeKey = "mangabaclaw.voiceWakeTriggersTalkMode"
let talkEnabledKey = "mangabaclaw.talkEnabled"
let talkPhaseSoundsEnabledKey = "mangabaclaw.talkPhaseSoundsEnabled"
let talkShiftToStopEnabledKey = "mangabaclaw.talkShiftToStopEnabled"
let iconOverrideKey = "mangabaclaw.iconOverride"
let connectionModeKey = "mangabaclaw.connectionMode"
let remoteTargetKey = "mangabaclaw.remoteTarget"
let remoteIdentityKey = "mangabaclaw.remoteIdentity"
let remoteProjectRootKey = "mangabaclaw.remoteProjectRoot"
let remoteCliPathKey = "mangabaclaw.remoteCliPath"
let canvasEnabledKey = "mangabaclaw.canvasEnabled"
let quickChatEnabledKey = "mangabaclaw.quickChatEnabled"
let cameraEnabledKey = "mangabaclaw.cameraEnabled"
let computerControlEnabledKey = "mangabaclaw.computerControlEnabled"
let computerControlProviderKey = "mangabaclaw.computerControlProvider"
let cookieSyncEnabledKey = "mangabaclaw.cookieSyncEnabled"
let cookieSyncIntoProfileKey = "mangabaclaw.cookieSyncIntoProfile"
let cookieSyncDomainsKey = "mangabaclaw.cookieSyncDomains"

func isComputerControlEnabled(
    defaults: UserDefaults = AppDefaults.standard,
    launchPlan: AppLaunchRuntimePlan = .current) -> Bool
{
    // object(forKey:) preserves an explicit false; bool(forKey:) would conflate it with an unset default.
    let storedValue = defaults.object(forKey: computerControlEnabledKey) as? Bool ?? true
    return launchPlan.resolveComputerControlEnabled(storedValue)
}

let activeComputerPresenceEnabledKey = "mangabaclaw.activeComputerPresenceEnabled"
let locationModeKey = "mangabaclaw.locationMode"
let locationPreciseKey = "mangabaclaw.locationPreciseEnabled"
let peekabooBridgeEnabledKey = "mangabaclaw.peekabooBridgeEnabled"
let deepLinkKeyKey = "mangabaclaw.deepLinkKey"
let cliInstallPromptedVersionKey = "mangabaclaw.cliInstallPromptedVersion"
let cliInstallPolicyKey = "mangabaclaw.cliInstallPolicy"
let cliManagedRestartPendingKey = "mangabaclaw.cliManagedRestartPending"
let postAppUpdateReceiptKey = "mangabaclaw.postAppUpdateReceipt"
let lastLaunchedAppVersionKey = "mangabaclaw.lastLaunchedAppVersion"
let cliValidatedExecutableKey = "mangabaclaw.cliValidatedExecutable"
let cliValidatedVersionKey = "mangabaclaw.cliValidatedVersion"
let macNodeIdentityProfileKey = "mangabaclaw.macNodeIdentityProfile"
let heartbeatsEnabledKey = "mangabaclaw.heartbeatsEnabled"
let debugPaneEnabledKey = "mangabaclaw.debugPaneEnabled"
let nativeSettingsPanesEnabledKey = "mangabaclaw.nativeSettingsPanesEnabled"
let debugFileLogEnabledKey = "mangabaclaw.debug.fileLogEnabled"
let appLogLevelKey = "mangabaclaw.debug.appLogLevel"
let voiceWakeSupported: Bool = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
