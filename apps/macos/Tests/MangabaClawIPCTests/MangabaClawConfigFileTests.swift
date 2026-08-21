import Foundation
import Testing
@testable import MangabaClaw

@Suite(.serialized)
struct MangabaClawConfigFileTests {
    private func makeConfigOverridePath() -> String {
        FileManager().temporaryDirectory
            .appendingPathComponent("mangabaclaw-config-\(UUID().uuidString)")
            .appendingPathComponent("mangabaclaw.json")
            .path
    }

    @Test
    func `config path respects env override`() async {
        let override = self.makeConfigOverridePath()

        await TestIsolation.withEnvValues(["MANGABACLAW_CONFIG_PATH": override]) {
            #expect(MangabaClawConfigFile.url().path == override)
        }
    }

    @MainActor
    @Test
    func `browser control enabled reads config flag`() async {
        let override = self.makeConfigOverridePath()

        await TestIsolation.withEnvValues(["MANGABACLAW_CONFIG_PATH": override]) {
            #expect(MangabaClawConfigFile.browserControlEnabled() == true)
            MangabaClawConfigFile.saveDict(["browser": ["enabled": false]])
            #expect(MangabaClawConfigFile.browserControlEnabled() == false)
            MangabaClawConfigFile.setBrowserControlEnabled(true)
            #expect(MangabaClawConfigFile.browserControlEnabled() == true)
        }
    }

    @MainActor
    @Test
    func `remote gateway port parses and matches host`() async {
        let override = self.makeConfigOverridePath()

        await TestIsolation.withEnvValues(["MANGABACLAW_CONFIG_PATH": override]) {
            MangabaClawConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "ws://gateway.ts.net:19999",
                    ],
                ],
            ])
            #expect(MangabaClawConfigFile.remoteGatewayPort() == 19999)
            #expect(MangabaClawConfigFile.remoteGatewayPort(matchingHost: "gateway.ts.net") == 19999)
            #expect(MangabaClawConfigFile.remoteGatewayPort(matchingHost: "GATEWAY.ts.net.") == 19999)
            #expect(MangabaClawConfigFile.remoteGatewayPort(matchingHost: "gateway") == nil)
            #expect(MangabaClawConfigFile.remoteGatewayPort(matchingHost: "other.ts.net") == nil)
            #expect(MangabaClawConfigFile.remoteGatewayPort(matchingHost: "gateway.attacker.tld") == nil)
        }
    }

    @Test
    func `state dir override sets config path`() async {
        let dir = FileManager().temporaryDirectory
            .appendingPathComponent("mangabaclaw-state-\(UUID().uuidString)", isDirectory: true)
            .path

        await TestIsolation.withEnvValues([
            "MANGABACLAW_CONFIG_PATH": nil,
            "MANGABACLAW_STATE_DIR": dir,
        ]) {
            #expect(MangabaClawConfigFile.stateDirURL().path == dir)
            #expect(MangabaClawConfigFile.url().path == "\(dir)/mangabaclaw.json")
        }
    }

    @MainActor
    @Test
    func `save dict appends config audit log`() async throws {
        let stateDir = FileManager().temporaryDirectory
            .appendingPathComponent("mangabaclaw-state-\(UUID().uuidString)", isDirectory: true)
        let configPath = stateDir.appendingPathComponent("mangabaclaw.json")
        let auditPath = stateDir.appendingPathComponent("logs/config-audit.jsonl")

        defer { try? FileManager().removeItem(at: stateDir) }

        try await TestIsolation.withEnvValues([
            "MANGABACLAW_STATE_DIR": stateDir.path,
            "MANGABACLAW_CONFIG_PATH": configPath.path,
        ]) {
            MangabaClawConfigFile.saveDict([
                "gateway": ["mode": "local"],
            ])

            let configData = try Data(contentsOf: configPath)
            let configRoot = try JSONSerialization.jsonObject(with: configData) as? [String: Any]
            #expect((configRoot?["meta"] as? [String: Any]) != nil)

            let rawAudit = try String(contentsOf: auditPath, encoding: .utf8)
            let lines = rawAudit
                .split(whereSeparator: \.isNewline)
                .map(String.init)
            #expect(!lines.isEmpty)
            guard let last = lines.last else {
                Issue.record("Missing config audit line")
                return
            }
            let auditRoot = try JSONSerialization.jsonObject(with: Data(last.utf8)) as? [String: Any]
            #expect(auditRoot?["source"] as? String == "macos-mangabaclaw-config-file")
            #expect(auditRoot?["event"] as? String == "config.write")
            #expect(auditRoot?["result"] as? String == "success")
            #expect(auditRoot?["configPath"] as? String == configPath.path)
            #expect(auditRoot?["previousMode"] is NSNull)
            #expect(auditRoot?["nextMode"] is NSNumber)
            #expect(auditRoot?["previousIno"] is NSNull)
            #expect(auditRoot?["nextIno"] as? String != nil)
        }
    }

    @MainActor
    @Test
    func `save dict removes retired config metadata`() async throws {
        let configPath = self.makeConfigOverridePath()
        defer { try? FileManager().removeItem(at: URL(fileURLWithPath: configPath).deletingLastPathComponent()) }

        try await TestIsolation.withEnvValues(["MANGABACLAW_CONFIG_PATH": configPath]) {
            #expect(MangabaClawConfigFile.saveDict([
                "gateway": ["mode": "local"],
                "meta": ["lastTouchedAt": "2026-08-05T22:45:14Z"],
            ]))

            let data = try Data(contentsOf: URL(fileURLWithPath: configPath))
            let root = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
            let meta = try #require(root["meta"] as? [String: Any])
            #expect(meta["lastTouchedVersion"] as? String != nil)
            #expect(meta["lastTouchedAt"] == nil)
        }
    }

    @MainActor
    @Test
    func `gateway start migration repairs existing retired config metadata`() async throws {
        let configPath = self.makeConfigOverridePath()
        let configURL = URL(fileURLWithPath: configPath)
        defer { try? FileManager().removeItem(at: configURL.deletingLastPathComponent()) }

        try FileManager().createDirectory(
            at: configURL.deletingLastPathComponent(),
            withIntermediateDirectories: true)
        try Data(
            #"{"gateway":{"mode":"local"},"meta":{"lastTouchedAt":"2026-08-05T22:45:14Z"}}"#.utf8)
            .write(to: configURL)

        try await TestIsolation.withEnvValues(["MANGABACLAW_CONFIG_PATH": configPath]) {
            #expect(MangabaClawConfigFile.migrateRetiredAppMetadataForGatewayStart())

            let data = try Data(contentsOf: configURL)
            let root = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
            let gateway = try #require(root["gateway"] as? [String: Any])
            let meta = try #require(root["meta"] as? [String: Any])
            #expect(gateway["mode"] as? String == "local")
            #expect(meta["lastTouchedVersion"] as? String != nil)
            #expect(meta["lastTouchedAt"] == nil)
        }
    }

    @MainActor
    @Test
    func `save dict preserves gateway auth unless explicitly allowed`() async throws {
        let stateDir = FileManager().temporaryDirectory
            .appendingPathComponent("mangabaclaw-state-\(UUID().uuidString)", isDirectory: true)
        let configPath = stateDir.appendingPathComponent("mangabaclaw.json")

        defer { try? FileManager().removeItem(at: stateDir) }

        await TestIsolation.withEnvValues([
            "MANGABACLAW_STATE_DIR": stateDir.path,
            "MANGABACLAW_CONFIG_PATH": configPath.path,
        ]) {
            MangabaClawConfigFile.saveDict([
                "gateway": [
                    "mode": "remote",
                    "auth": [
                        "mode": "token",
                        "token": "existing-token", // pragma: allowlist secret
                    ],
                ],
            ])

            MangabaClawConfigFile.saveDict([
                "gateway": [
                    "mode": "local",
                ],
            ])

            let root = MangabaClawConfigFile.loadDict()
            let gateway = root["gateway"] as? [String: Any]
            let auth = gateway?["auth"] as? [String: Any]
            #expect(gateway?["mode"] as? String == "local")
            #expect(auth?["mode"] as? String == "token")
            #expect(auth?["token"] as? String == "existing-token") // pragma: allowlist secret

            MangabaClawConfigFile.saveDict([
                "gateway": [
                    "mode": "local",
                ],
            ], allowGatewayAuthMutation: true)

            let allowedRoot = MangabaClawConfigFile.loadDict()
            let allowedGateway = allowedRoot["gateway"] as? [String: Any]
            #expect(allowedGateway?["mode"] as? String == "local")
            #expect((allowedGateway?["auth"] as? [String: Any]) == nil)
        }
    }

    @MainActor
    @Test
    func `save dict can merge local fallback writes with fresh config`() async throws {
        let stateDir = FileManager().temporaryDirectory
            .appendingPathComponent("mangabaclaw-state-\(UUID().uuidString)", isDirectory: true)
        let configPath = stateDir.appendingPathComponent("mangabaclaw.json")

        defer { try? FileManager().removeItem(at: stateDir) }

        await TestIsolation.withEnvValues([
            "MANGABACLAW_STATE_DIR": stateDir.path,
            "MANGABACLAW_CONFIG_PATH": configPath.path,
        ]) {
            MangabaClawConfigFile.saveDict([
                "gateway": [
                    "mode": "remote",
                    "auth": [
                        "mode": "password",
                        "password": "existing-password", // pragma: allowlist secret
                    ],
                ],
                "browser": [
                    "enabled": true,
                    "profile": "work",
                ],
                "channels": [
                    "discord": [
                        "enabled": true,
                    ],
                ],
            ])

            MangabaClawConfigFile.saveDict([
                "gateway": [
                    "mode": "local",
                ],
                "browser": [
                    "enabled": false,
                ],
            ], preserveExistingKeys: true)

            let root = MangabaClawConfigFile.loadDict()
            let gateway = root["gateway"] as? [String: Any]
            let auth = gateway?["auth"] as? [String: Any]
            let browser = root["browser"] as? [String: Any]
            let discord = ((root["channels"] as? [String: Any])?["discord"] as? [String: Any])
            #expect(gateway?["mode"] as? String == "local")
            #expect(auth?["mode"] as? String == "password")
            #expect(auth?["password"] as? String == "existing-password") // pragma: allowlist secret
            #expect(browser?["enabled"] as? Bool == false)
            #expect(browser?["profile"] as? String == "work")
            #expect(discord?["enabled"] as? Bool == true)
        }
    }

    @MainActor
    @Test
    func `load dict ignores legacy config health sidecar`() async throws {
        let stateDir = FileManager().temporaryDirectory
            .appendingPathComponent("mangabaclaw-state-\(UUID().uuidString)", isDirectory: true)
        let configPath = stateDir.appendingPathComponent("mangabaclaw.json")
        let auditPath = stateDir.appendingPathComponent("logs/config-audit.jsonl")
        let configHealthPath = stateDir.appendingPathComponent("logs/config-health.json")

        defer { try? FileManager().removeItem(at: stateDir) }

        try FileManager().createDirectory(
            at: configHealthPath.deletingLastPathComponent(),
            withIntermediateDirectories: true)
        let legacyHealth = """
        {
          "entries": {
            "\(configPath.path)": {
              "lastKnownGood": {
                "bytes": 4096,
                "gatewayMode": "local",
                "hasMeta": true
              }
            }
          }
        }
        """
        try legacyHealth.write(to: configHealthPath, atomically: true, encoding: .utf8)
        let updateOnlyConfig = """
        {
          "update": {
            "channel": "beta"
          }
        }
        """
        try updateOnlyConfig.write(to: configPath, atomically: true, encoding: .utf8)

        try await TestIsolation.withEnvValues([
            "MANGABACLAW_STATE_DIR": stateDir.path,
            "MANGABACLAW_CONFIG_PATH": configPath.path,
        ]) {
            try MangabaClawConfigFile.withTestingFileLock {
                let loaded = MangabaClawConfigFile.loadDict()
                let update = loaded["update"] as? [String: Any]
                #expect(update?["channel"] as? String == "beta")
                #expect(!FileManager().fileExists(atPath: auditPath.path))
                let persistedHealth = try String(contentsOf: configHealthPath, encoding: .utf8)
                #expect(persistedHealth == legacyHealth)
            }
        }
    }

    @MainActor
    @Test
    func `load dict skips unchanged forensic fingerprints`() async throws {
        let stateDir = FileManager().temporaryDirectory
            .appendingPathComponent("mangabaclaw-state-\(UUID().uuidString)", isDirectory: true)
        let configPath = stateDir.appendingPathComponent("mangabaclaw.json")

        defer { try? FileManager().removeItem(at: stateDir) }

        try FileManager().createDirectory(at: stateDir, withIntermediateDirectories: true)
        try """
        {
          "gateway": {
            "mode": "local"
          }
        }
        """.write(to: configPath, atomically: true, encoding: .utf8)

        try await TestIsolation.withEnvValues([
            "MANGABACLAW_STATE_DIR": stateDir.path,
            "MANGABACLAW_CONFIG_PATH": configPath.path,
        ]) {
            try MangabaClawConfigFile.withTestingFileLock {
                let before = MangabaClawConfigFile.testingConfigObservationCount()
                _ = MangabaClawConfigFile.loadDict()
                let afterFirstRead = MangabaClawConfigFile.testingConfigObservationCount()
                _ = MangabaClawConfigFile.loadDict()
                let afterUnchangedRead = MangabaClawConfigFile.testingConfigObservationCount()

                let attributes = try FileManager.default.attributesOfItem(atPath: configPath.path)
                let currentMode = try #require(
                    (attributes[.posixPermissions] as? NSNumber)?.intValue)
                try FileManager().setAttributes(
                    [.posixPermissions: currentMode ^ 0o100],
                    ofItemAtPath: configPath.path)
                _ = MangabaClawConfigFile.loadDict()
                let afterMetadataChange = MangabaClawConfigFile.testingConfigObservationCount()

                #expect(afterFirstRead == before + 1)
                #expect(afterUnchangedRead == afterFirstRead)
                #expect(afterMetadataChange == afterFirstRead + 1)
            }
        }
    }

    @MainActor
    @Test
    func `load dict audits suspicious out-of-band clobbers`() async throws {
        let stateDir = FileManager().temporaryDirectory
            .appendingPathComponent("mangabaclaw-state-\(UUID().uuidString)", isDirectory: true)
        let configPath = stateDir.appendingPathComponent("mangabaclaw.json")
        let auditPath = stateDir.appendingPathComponent("logs/config-audit.jsonl")
        let configHealthPath = stateDir.appendingPathComponent("logs/config-health.json")

        defer { try? FileManager().removeItem(at: stateDir) }

        try await TestIsolation.withEnvValues([
            "MANGABACLAW_STATE_DIR": stateDir.path,
            "MANGABACLAW_CONFIG_PATH": configPath.path,
        ]) {
            try MangabaClawConfigFile.withTestingFileLock {
                MangabaClawConfigFile.saveDict([
                    "update": ["channel": "beta"],
                    "browser": ["enabled": true],
                    "gateway": ["mode": "local"],
                    "channels": [
                        "discord": [
                            "enabled": true,
                            "dmPolicy": "pairing",
                        ],
                    ],
                ])
                _ = MangabaClawConfigFile.loadDict()
                #expect(!FileManager().fileExists(atPath: configHealthPath.path))

                let clobbered = """
                {
                  "update": {
                    "channel": "beta"
                  }
                }
                """
                try clobbered.write(to: configPath, atomically: true, encoding: .utf8)

                let loaded = MangabaClawConfigFile.loadDict()
                #expect((loaded["gateway"] as? [String: Any]) == nil)
                #expect(!FileManager().fileExists(atPath: configHealthPath.path))

                let rawAudit = try String(contentsOf: auditPath, encoding: .utf8)
                let lines = rawAudit
                    .split(whereSeparator: \.isNewline)
                    .map(String.init)
                let observeLine = lines.reversed().first { $0.contains("\"event\":\"config.observe\"") }
                #expect(observeLine != nil)
                guard let observeLine else {
                    Issue.record("Missing config.observe audit line")
                    return
                }
                let auditRoot = try JSONSerialization.jsonObject(with: Data(observeLine.utf8)) as? [String: Any]
                #expect(auditRoot?["source"] as? String == "macos-mangabaclaw-config-file")
                #expect(auditRoot?["configPath"] as? String == configPath.path)
                #expect(auditRoot?["mode"] is NSNumber)
                #expect(auditRoot?["ino"] as? String != nil)
                #expect(auditRoot?["lastKnownGoodMode"] is NSNumber)
                #expect(auditRoot?["backupMode"] is NSNull)
                let suspicious = auditRoot?["suspicious"] as? [String] ?? []
                #expect(suspicious.contains("gateway-mode-missing-vs-last-good"))
                #expect(suspicious.contains("update-channel-only-root"))

                let clobberedPath = auditRoot?["clobberedPath"] as? String
                #expect(clobberedPath != nil)
                if let clobberedPath {
                    let preserved = try String(contentsOfFile: clobberedPath, encoding: .utf8)
                    #expect(preserved == clobbered)
                }
            }
        }
    }

    @MainActor
    @Test
    func `save dict records preserved gateway auth in audit`() async throws {
        let stateDir = FileManager().temporaryDirectory
            .appendingPathComponent("mangabaclaw-state-\(UUID().uuidString)", isDirectory: true)
        let configPath = stateDir.appendingPathComponent("mangabaclaw.json")
        let auditPath = stateDir.appendingPathComponent("logs/config-audit.jsonl")

        defer { try? FileManager().removeItem(at: stateDir) }

        try await TestIsolation.withEnvValues([
            "MANGABACLAW_STATE_DIR": stateDir.path,
            "MANGABACLAW_CONFIG_PATH": configPath.path,
        ]) {
            MangabaClawConfigFile.saveDict([
                "gateway": [
                    "mode": "local",
                    "auth": [
                        "mode": "token",
                        "token": "test-token", // pragma: allowlist secret
                    ],
                ],
            ])

            let saved = MangabaClawConfigFile.saveDict([
                "gateway": [
                    "mode": "local",
                ],
                "browser": [
                    "enabled": false,
                ],
            ])

            #expect(saved)
            let data = try Data(contentsOf: configPath)
            let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            let gateway = root?["gateway"] as? [String: Any]
            let auth = gateway?["auth"] as? [String: Any]
            #expect(gateway?["mode"] as? String == "local")
            #expect(auth?["mode"] as? String == "token")
            #expect(auth?["token"] as? String == "test-token") // pragma: allowlist secret
            #expect((root?["meta"] as? [String: Any]) != nil)

            let rawAudit = try String(contentsOf: auditPath, encoding: .utf8)
            let last = rawAudit.split(whereSeparator: \.isNewline).map(String.init).last
            let auditRoot = try JSONSerialization.jsonObject(with: Data((last ?? "{}").utf8)) as? [String: Any]
            #expect(auditRoot?["result"] as? String == "success")
            #expect(auditRoot?["preservedGatewayAuth"] as? Bool == true)
            let suspicious = auditRoot?["suspicious"] as? [String] ?? []
            #expect(suspicious.contains("gateway-auth-preserved"))
        }
    }

    @MainActor
    @Test
    func `save dict rejects gateway mode removal and keeps previous config`() async throws {
        let stateDir = FileManager().temporaryDirectory
            .appendingPathComponent("mangabaclaw-state-\(UUID().uuidString)", isDirectory: true)
        let configPath = stateDir.appendingPathComponent("mangabaclaw.json")
        let auditPath = stateDir.appendingPathComponent("logs/config-audit.jsonl")

        defer { try? FileManager().removeItem(at: stateDir) }

        try await TestIsolation.withEnvValues([
            "MANGABACLAW_STATE_DIR": stateDir.path,
            "MANGABACLAW_CONFIG_PATH": configPath.path,
        ]) {
            MangabaClawConfigFile.saveDict([
                "gateway": [
                    "mode": "local",
                    "auth": [
                        "mode": "token",
                        "token": "test-token", // pragma: allowlist secret
                    ],
                ],
                "browser": [
                    "enabled": true,
                ],
            ])
            let before = try String(contentsOf: configPath, encoding: .utf8)

            let saved = MangabaClawConfigFile.saveDict([
                "browser": [
                    "enabled": false,
                ],
            ])

            #expect(!saved)
            let after = try String(contentsOf: configPath, encoding: .utf8)
            #expect(after == before)

            let rawAudit = try String(contentsOf: auditPath, encoding: .utf8)
            let lines = rawAudit.split(whereSeparator: \.isNewline).map(String.init)
            guard let last = lines.last else {
                Issue.record("Missing rejected config audit line")
                return
            }
            let auditRoot = try JSONSerialization.jsonObject(with: Data(last.utf8)) as? [String: Any]
            #expect(auditRoot?["result"] as? String == "rejected")
            let suspicious = auditRoot?["suspicious"] as? [String] ?? []
            let blocking = auditRoot?["blocking"] as? [String] ?? []
            #expect(suspicious.contains("gateway-mode-removed"))
            #expect(blocking.contains("gateway-mode-removed"))
            if let rejectedPath = auditRoot?["rejectedPath"] as? String {
                #expect(FileManager().fileExists(atPath: rejectedPath))
                let attributes = try FileManager().attributesOfItem(atPath: rejectedPath)
                let mode = attributes[.posixPermissions] as? NSNumber
                #expect(mode?.intValue == 0o600)
            } else {
                Issue.record("Missing rejected payload path")
            }
        }
    }
}
