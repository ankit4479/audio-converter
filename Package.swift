// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "AudioConverter",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "AudioConverter",
            path: "Sources/AudioConverter"
        )
    ]
)
