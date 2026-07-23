import Foundation
import AVFoundation

enum FileIntake {
    /// Walks dropped/chosen URLs into a flat list of audio files. A loose file becomes
    /// just its own filename; a dropped folder's contents are prefixed with that
    /// folder's name so ConversionEngine can later mirror the structure on output.
    static func scan(urls: [URL]) -> [AudioFile] {
        var results: [AudioFile] = []
        let fm = FileManager.default

        for url in urls {
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: url.path, isDirectory: &isDir) else { continue }

            if isDir.boolValue {
                let baseName = url.lastPathComponent
                let basePath = url.standardizedFileURL.path
                guard let enumerator = fm.enumerator(
                    at: url,
                    includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey],
                    options: [.skipsHiddenFiles]
                ) else { continue }

                for case let fileURL as URL in enumerator {
                    guard AudioFileTypes.isAudioFile(fileURL) else { continue }
                    let fullPath = fileURL.standardizedFileURL.path
                    let subPath = fullPath.hasPrefix(basePath + "/")
                        ? String(fullPath.dropFirst(basePath.count + 1))
                        : fileURL.lastPathComponent
                    let size = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                    results.append(AudioFile(
                        url: fileURL,
                        relativePath: baseName + "/" + subPath,
                        fileSize: Int64(size)
                    ))
                }
            } else if AudioFileTypes.isAudioFile(url) {
                let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                results.append(AudioFile(url: url, relativePath: url.lastPathComponent, fileSize: Int64(size)))
            }
        }

        return results
    }

    /// Sums duration across files with bounded concurrency, so a batch of hundreds of
    /// songs doesn't open hundreds of AVAssets at once.
    static func totalDuration(of files: [AudioFile]) async -> TimeInterval {
        await withTaskGroup(of: TimeInterval.self) { group in
            var total: TimeInterval = 0
            var iterator = files.makeIterator()
            let concurrency = 8

            func addNext() {
                guard let file = iterator.next() else { return }
                group.addTask {
                    let asset = AVURLAsset(url: file.url)
                    guard let duration = try? await asset.load(.duration) else { return 0 }
                    let seconds = duration.seconds
                    return seconds.isFinite && seconds > 0 ? seconds : 0
                }
            }

            for _ in 0..<concurrency { addNext() }
            while let value = await group.next() {
                total += value
                addNext()
            }
            return total
        }
    }
}
