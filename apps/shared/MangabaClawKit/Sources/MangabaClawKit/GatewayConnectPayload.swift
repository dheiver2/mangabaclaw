import Foundation
import MangabaClawProtocol

enum GatewayConnectPayload {
    static func makeClient(
        options: GatewayConnectOptions,
        displayName: String,
        platform: String) -> [String: MangabaClawProtocol.AnyCodable]
    {
        var client: [String: MangabaClawProtocol.AnyCodable] = [
            "id": MangabaClawProtocol.AnyCodable(options.clientId),
            "displayName": MangabaClawProtocol.AnyCodable(displayName),
            "version": MangabaClawProtocol.AnyCodable(
                Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"),
            "platform": MangabaClawProtocol.AnyCodable(platform),
            "mode": MangabaClawProtocol.AnyCodable(options.clientMode),
            "instanceId": MangabaClawProtocol.AnyCodable(InstanceIdentity.instanceId),
            "deviceFamily": MangabaClawProtocol.AnyCodable(InstanceIdentity.deviceFamily),
        ]
        if let model = InstanceIdentity.modelIdentifier {
            client["modelIdentifier"] = MangabaClawProtocol.AnyCodable(model)
        }
        return client
    }
}
