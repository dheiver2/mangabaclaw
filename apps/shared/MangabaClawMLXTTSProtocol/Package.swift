// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "MangabaClawMLXTTSProtocol",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "MangabaClawMLXTTSProtocol", targets: ["MangabaClawMLXTTSProtocol"]),
    ],
    targets: [
        .target(name: "MangabaClawMLXTTSProtocol"),
        .testTarget(
            name: "MangabaClawMLXTTSProtocolTests",
            dependencies: ["MangabaClawMLXTTSProtocol"]),
    ])
