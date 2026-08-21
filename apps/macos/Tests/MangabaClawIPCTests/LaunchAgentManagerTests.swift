import Foundation
import Testing
@testable import MangabaClaw

struct LaunchAgentManagerTests {
    @Test func `active profile performs no login agent reads or writes`() async {
        let profile = AppProfile(environment: ["MANGABACLAW_PROFILE": "work"])
        var writes: [String] = []
        LaunchAgentManager._testResetLaunchctlCalls()

        #expect(await !(LaunchAgentManager.status(profile: profile)))
        #expect(await !(LaunchAgentManager.set(
            enabled: true,
            bundlePath: "/Applications/MangabaClaw.app",
            profile: profile,
            writePlist: { writes.append($0) })))
        #expect(await !(LaunchAgentManager.set(
            enabled: false,
            bundlePath: "/Applications/MangabaClaw.app",
            profile: profile,
            writePlist: { writes.append($0) })))
        #expect(writes.isEmpty)
        #expect(LaunchAgentManager._testLaunchctlCallSnapshot().isEmpty)
    }

    @Test func `enabling an already loaded login job only refreshes its plist`() async {
        var persistedBundlePaths: [String] = []
        let reloaded = await LaunchAgentManager.set(
            enabled: true,
            bundlePath: "/Applications/MangabaClaw.app",
            loaded: true,
            writePlist: { persistedBundlePaths.append($0) })

        #expect(reloaded == false)
        #expect(persistedBundlePaths == ["/Applications/MangabaClaw.app"])
    }

    @Test func `launch at login plist does not keep app alive after manual quit`() throws {
        let plist = LaunchAgentManager.plistContents(bundlePath: "/Applications/MangabaClaw.app")
        let data = try #require(plist.data(using: .utf8))
        let object = try #require(
            PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])

        #expect(object["RunAtLoad"] as? Bool == true)
        #expect(object["KeepAlive"] == nil)

        let args = try #require(object["ProgramArguments"] as? [String])
        #expect(args == ["/Applications/MangabaClaw.app/Contents/MacOS/MangabaClaw"])
    }

    @MainActor
    @Test func `launch at login plist preserves normalized profile environment once`() async throws {
        try await TestIsolation.withEnvValues([
            "MANGABACLAW_CONFIG_PATH": "  /tmp/custom&<mangabaclaw>\"'.json  ",
            "MANGABACLAW_STATE_DIR": "/tmp/mangabaclaw-state",
        ]) {
            let plist = LaunchAgentManager.plistContents(
                bundlePath: "/Applications/MangabaClaw.app",
                preferredPaths: ["/tmp/custom&<bin>", "/usr/bin"])
            let data = try #require(plist.data(using: .utf8))
            let object = try #require(
                PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])

            let environment = try #require(object["EnvironmentVariables"] as? [String: String])
            #expect(environment["MANGABACLAW_CONFIG_PATH"] == "/tmp/custom&<mangabaclaw>\"'.json")
            #expect(environment["MANGABACLAW_STATE_DIR"] == "/tmp/mangabaclaw-state")
            #expect(environment["PATH"]?.contains("/tmp/custom&<bin>") == true)
            #expect(plist.components(separatedBy: "<key>MANGABACLAW_CONFIG_PATH</key>").count == 2)
            #expect(plist.components(separatedBy: "<key>MANGABACLAW_STATE_DIR</key>").count == 2)
        }
    }

    @MainActor
    @Test func `launch at login plist omits unset and blank profile environment`() async throws {
        try await TestIsolation.withEnvValues([
            "MANGABACLAW_CONFIG_PATH": nil,
            "MANGABACLAW_STATE_DIR": " \n ",
        ]) {
            let plist = LaunchAgentManager.plistContents(bundlePath: "/Applications/MangabaClaw.app")
            let data = try #require(plist.data(using: .utf8))
            let object = try #require(
                PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])

            let environment = try #require(object["EnvironmentVariables"] as? [String: String])
            #expect(environment.keys.sorted() == ["PATH"])
            #expect(!plist.contains("MANGABACLAW_CONFIG_PATH"))
            #expect(!plist.contains("MANGABACLAW_STATE_DIR"))
        }
    }
}
