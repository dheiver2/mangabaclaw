public struct MangabaClawChatAudioInputDevice: Equatable, Identifiable, Sendable {
    public var id: String
    public var name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

public enum MangabaClawCameraFacingSelection: String, Equatable, Sendable {
    case back
    case front
}

public struct MangabaClawChatTalkControl {
    public var isEnabled: Bool
    public var isListening: Bool
    public var isSpeaking: Bool
    public var isGatewayConnected: Bool
    public var statusText: String
    public var providerLabel: String
    public var level: Double
    public var partialTranscript: String
    public var recentTranscript: [String]
    public var inputDevices: [MangabaClawChatAudioInputDevice]
    public var selectedInputDeviceID: String?
    public var selectInputDevice: (@MainActor (_ deviceID: String?) -> Void)?
    public var cameraFacing: MangabaClawCameraFacingSelection?
    public var flipCamera: (@MainActor () -> Void)?
    public var toggle: @MainActor (_ sessionKey: String) -> Void

    public init(
        isEnabled: Bool,
        isListening: Bool,
        isSpeaking: Bool,
        isGatewayConnected: Bool,
        statusText: String,
        providerLabel: String,
        level: Double = 0,
        partialTranscript: String = "",
        recentTranscript: [String] = [],
        inputDevices: [MangabaClawChatAudioInputDevice] = [],
        selectedInputDeviceID: String? = nil,
        selectInputDevice: (@MainActor (_ deviceID: String?) -> Void)? = nil,
        cameraFacing: MangabaClawCameraFacingSelection? = nil,
        flipCamera: (@MainActor () -> Void)? = nil,
        toggle: @escaping @MainActor (_ sessionKey: String) -> Void)
    {
        self.isEnabled = isEnabled
        self.isListening = isListening
        self.isSpeaking = isSpeaking
        self.isGatewayConnected = isGatewayConnected
        self.statusText = statusText
        self.providerLabel = providerLabel
        self.level = level
        self.partialTranscript = partialTranscript
        self.recentTranscript = recentTranscript
        self.inputDevices = inputDevices
        self.selectedInputDeviceID = selectedInputDeviceID
        self.selectInputDevice = selectInputDevice
        self.cameraFacing = cameraFacing
        self.flipCamera = flipCamera
        self.toggle = toggle
    }
}
