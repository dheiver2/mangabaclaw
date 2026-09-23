// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "MangabaClawKit",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
        .watchOS(.v11),
    ],
    products: [
        .library(name: "MangabaClawProtocol", targets: ["MangabaClawProtocol"]),
        .library(name: "MangabaClawNativeState", targets: ["MangabaClawNativeState"]),
        .library(name: "MangabaClawKit", targets: ["MangabaClawKit"]),
        .library(name: "MangabaClawChatUI", targets: ["MangabaClawChatUI"]),
    ],
    traits: [
        .trait(name: "Talk", description: "ElevenLabs cloud TTS / talk support"),
        .default(enabledTraits: ["Talk"]),
    ],
    dependencies: [
        .package(url: "https://github.com/steipete/ElevenLabsKit", exact: "0.1.3"),
        .package(url: "https://github.com/groue/GRDB.swift.git", exact: "7.11.1"),
        .package(url: "https://github.com/mgriebling/SwiftMath", exact: "1.7.3"),
        .package(url: "https://github.com/swiftlang/swift-markdown", exact: "0.9.0"),
    ],
    targets: [
        .target(
            name: "MangabaClawProtocol",
            path: "Sources/MangabaClawProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "MangabaClawNativeState",
            path: "Sources/MangabaClawNativeState",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "MangabaClawKit",
            dependencies: [
                "MangabaClawNativeState",
                "MangabaClawProtocol",
                .product(
                    name: "ElevenLabsKit",
                    package: "ElevenLabsKit",
                    condition: .when(platforms: [.iOS, .macOS], traits: ["Talk"])),
            ],
            path: "Sources/MangabaClawKit",
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "MangabaClawChatUI",
            dependencies: [
                "MangabaClawKit",
                "MangabaClawProtocol",
                .product(name: "GRDB", package: "GRDB.swift"),
                .product(name: "Markdown", package: "swift-markdown"),
                .product(name: "SwiftMath", package: "SwiftMath"),
            ],
            path: "Sources/MangabaClawChatUI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "MangabaClawKitTests",
            dependencies: [
                "MangabaClawKit",
                "MangabaClawChatUI",
                "MangabaClawProtocol",
                .product(name: "GRDB", package: "GRDB.swift"),
            ],
            path: "Tests/MangabaClawKitTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
        .testTarget(
            name: "MangabaClawNativeStateTests",
            dependencies: ["MangabaClawNativeState"],
            path: "Tests/MangabaClawNativeStateTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
