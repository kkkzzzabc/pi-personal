// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "pi-cua-helper",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "pi-cua-helper",
            path: "Sources/pi-cua-helper"
        ),
    ]
)
