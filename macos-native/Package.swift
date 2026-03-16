// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "WeekPlanner",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(
            name: "WeekPlanner",
            targets: ["WeekPlanner"]
        )
    ],
    targets: [
        .executableTarget(
            name: "WeekPlanner",
            path: "Sources/WeekPlannerNative"
        )
    ]
)
