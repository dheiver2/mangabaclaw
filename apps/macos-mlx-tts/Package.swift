// swift-tools-version: 6.2
// Isolated MLX TTS helper package. Keep this out of apps/macos/Package.swift so
// normal macOS app tests do not compile the full MLX audio stack.

import PackageDescription

let package = Package(
    name: "MangabaClawMLXTTS",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .executable(name: "mangabaclaw-mlx-tts", targets: ["MangabaClawMLXTTSHelper"]),
    ],
    dependencies: [
        // Progressive Fish chunks and cancellation from upstream PR #237.
        .package(
            url: "https://github.com/Blaizzy/mlx-audio-swift",
            revision: "2de211cf80ada19a75f291e491430e2af8e4befe"),
        .package(path: "../shared/MangabaClawMLXTTSProtocol"),
    ],
    targets: [
        .target(
            name: "MangabaClawMLXTTSRuntime",
            dependencies: [
                .product(name: "MLXAudioCore", package: "mlx-audio-swift"),
                .product(name: "MLXAudioTTS", package: "mlx-audio-swift"),
                .product(name: "MangabaClawMLXTTSProtocol", package: "MangabaClawMLXTTSProtocol"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "MangabaClawMLXTTSHelper",
            dependencies: [
                "MangabaClawMLXTTSRuntime",
                .product(name: "MangabaClawMLXTTSProtocol", package: "MangabaClawMLXTTSProtocol"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "MangabaClawMLXTTSRuntimeTests",
            dependencies: [
                "MangabaClawMLXTTSRuntime",
                .product(name: "MangabaClawMLXTTSProtocol", package: "MangabaClawMLXTTSProtocol"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
    ])
