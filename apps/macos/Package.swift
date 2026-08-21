// swift-tools-version: 6.2
// Package manifest for the MangabaClaw macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "MangabaClaw",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "MangabaClawIPC", targets: ["MangabaClawIPC"]),
        .library(name: "MangabaClawDiscovery", targets: ["MangabaClawDiscovery"]),
        .executable(name: "MangabaClaw", targets: ["MangabaClaw"]),
        .executable(name: "mangabaclaw-mac", targets: ["MangabaClawMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", exact: "3.0.1"),
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.3.0"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.4.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.12.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.9.0"),
        .package(
            url: "https://github.com/mangabaclaw/Peekaboo.git",
            revision: "028cd9eb2d7b413c26f02f169c5f6224b2fcb3e0"),
        .package(url: "https://github.com/pointfreeco/swift-concurrency-extras", from: "1.3.1"),
        .package(path: "../shared/MangabaClawKit"),
        .package(path: "../shared/MangabaClawMLXTTSProtocol"),
        .package(path: "../swabble"),
    ],
    targets: [
        .target(
            name: "MangabaClawCameraPTZNative",
            path: "Sources/MangabaClawCameraPTZNative",
            publicHeadersPath: "include",
            linkerSettings: [
                .linkedFramework("CoreFoundation"),
                .linkedFramework("IOKit"),
            ]),
        .target(
            name: "MangabaClawIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "MangabaClawDiscovery",
            dependencies: [
                .product(name: "MangabaClawKit", package: "MangabaClawKit"),
                .product(name: "Subprocess", package: "swift-subprocess"),
            ],
            path: "Sources/MangabaClawDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "MangabaClaw",
            dependencies: [
                "MangabaClawIPC",
                "MangabaClawDiscovery",
                "MangabaClawCameraPTZNative",
                .product(name: "MangabaClawNativeState", package: "MangabaClawKit"),
                .product(name: "MangabaClawKit", package: "MangabaClawKit"),
                .product(name: "MangabaClawChatUI", package: "MangabaClawKit"),
                .product(name: "MangabaClawMLXTTSProtocol", package: "MangabaClawMLXTTSProtocol"),
                .product(name: "MangabaClawProtocol", package: "MangabaClawKit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
                .product(name: "ConcurrencyExtras", package: "swift-concurrency-extras"),
                .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts"),
            ],
            exclude: [
                "Resources/Info.plist",
                "Resources/Localizable.xcstrings",
            ],
            resources: [
                .copy("Resources/MangabaClaw.icns"),
                .copy("Resources/DeviceModels"),
                .copy("Resources/ProviderIcons"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "MangabaClawMacCLI",
            dependencies: [
                "MangabaClawDiscovery",
                .product(name: "MangabaClawKit", package: "MangabaClawKit"),
                .product(name: "MangabaClawProtocol", package: "MangabaClawKit"),
            ],
            path: "Sources/MangabaClawMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "MangabaClawIPCTests",
            dependencies: [
                "MangabaClawIPC",
                "MangabaClaw",
                "MangabaClawMacCLI",
                "MangabaClawDiscovery",
                .product(name: "MangabaClawChatUI", package: "MangabaClawKit"),
                .product(name: "MangabaClawKit", package: "MangabaClawKit"),
                .product(name: "MangabaClawMLXTTSProtocol", package: "MangabaClawMLXTTSProtocol"),
                .product(name: "MangabaClawProtocol", package: "MangabaClawKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
