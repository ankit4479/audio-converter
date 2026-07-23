import Foundation

enum FFmpegLocator {
    /// Common install locations, checked first so the common case avoids spawning a
    /// process. Homebrew on Apple Silicon installs to /opt/homebrew; Intel Homebrew
    /// and MacPorts use different prefixes.
    private static let candidatePaths = [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/opt/local/bin/ffmpeg"
    ]

    static func find() -> String? {
        let fm = FileManager.default
        for path in candidatePaths where fm.isExecutableFile(atPath: path) {
            return path
        }
        return resolveViaShellPath()
    }

    private static func resolveViaShellPath() -> String? {
        let which = Process()
        which.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        which.arguments = ["ffmpeg"]
        let pipe = Pipe()
        which.standardOutput = pipe
        which.standardError = Pipe()
        do {
            try which.run()
            which.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            guard let path = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines), !path.isEmpty,
                FileManager.default.isExecutableFile(atPath: path) else { return nil }
            return path
        } catch {
            return nil
        }
    }
}
