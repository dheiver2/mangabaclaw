import Observation
import MangabaClawChatUI

@MainActor
@Observable
final class MacChatAudioInputCatalog {
    private(set) var devices: [AudioInputDeviceDescriptor] = []

    @ObservationIgnored private let observer = AudioInputDeviceObserver()

    func start() {
        self.refresh()
        self.observer.start { [weak self] in
            Task { @MainActor in
                self?.refresh()
            }
        }
    }

    func stop() {
        self.observer.stop()
    }

    func select(_ deviceID: String?, state: AppState) {
        let selectedID = deviceID ?? ""
        state.voiceWakeMicID = selectedID
        state.voiceWakeMicName = self.devices.first(where: { $0.uid == selectedID })?.name ?? ""
    }

    var chatDevices: [MangabaClawChatAudioInputDevice] {
        self.devices.map { MangabaClawChatAudioInputDevice(id: $0.uid, name: $0.name) }
    }

    private func refresh() {
        self.devices = AudioInputDeviceObserver.availableInputDevices()
    }
}
