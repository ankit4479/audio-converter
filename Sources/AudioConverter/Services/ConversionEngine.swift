import Foundation
import Observation

struct ConversionJob: Identifiable {
    let id = UUID()
    let file: AudioFile
    var outputURL: URL
    var status: Status = .pending

    enum Status: Equatable {
        case pending
        case running
        case done
        case failed(String)
    }
}

@MainActor
@Observable
final class ConversionEngine {
    private(set) var jobs: [ConversionJob] = []
    private(set) var isRunning = false
    private(set) var currentlyConverting: Set<String> = []

    let ffmpegPath: String? = FFmpegLocator.find()
    private let maxConcurrency: Int
    private var startedAt: Date?
    private var activeProcesses: [UUID: Process] = [:]
    private var cancelRequested = false

    init() {
        let cores = ProcessInfo.processInfo.activeProcessorCount
        maxConcurrency = min(max(cores - 2, 2), 8)
    }

    var totalCount: Int { jobs.count }
    var completedCount: Int { jobs.filter { $0.status == .done }.count }
    var failedJobs: [ConversionJob] {
        jobs.filter { if case .failed = $0.status { return true }; return false }
    }
    var isFinished: Bool { !isRunning && !jobs.isEmpty && completedCount + failedJobs.count == jobs.count }
    var currentFileName: String? { currentlyConverting.sorted().first }

    var estimatedTimeRemainingLabel: String? {
        guard let startedAt, completedCount > 0, isRunning else { return nil }
        let elapsed = Date().timeIntervalSince(startedAt)
        let perFile = elapsed / Double(completedCount)
        let remaining = perFile * Double(max(totalCount - completedCount - failedJobs.count, 0))
        return Self.formatDuration(remaining)
    }

    func start(files: [AudioFile], destination: URL, settings: ConversionSettings) async {
        guard let ffmpegPath else { return }

        var newJobs = files.map { file in
            ConversionJob(file: file, outputURL: Self.resolvedOutputURL(for: file, destination: destination, codec: settings.codec))
        }
        newJobs = Self.deduplicated(newJobs)

        jobs = newJobs
        isRunning = true
        startedAt = Date()
        cancelRequested = false

        await withTaskGroup(of: Void.self) { group in
            var iterator = jobs.indices.makeIterator()

            // Cancellation is checked inside runJob (properly MainActor-isolated
            // there) rather than here, since this closure itself runs outside actor
            // isolation and can't read cancelRequested directly.
            func launchNext() {
                guard let index = iterator.next() else { return }
                group.addTask { [weak self] in
                    await self?.runJob(at: index, ffmpegPath: ffmpegPath, settings: settings)
                }
            }

            for _ in 0..<maxConcurrency { launchNext() }
            while await group.next() != nil { launchNext() }
        }

        isRunning = false
    }

    /// Stops launching new conversions and terminates whatever is currently running.
    /// Jobs that never got picked up are marked failed so the totals stay consistent.
    func cancel() {
        cancelRequested = true
        for process in activeProcesses.values where process.isRunning {
            process.terminate()
        }
    }

    func reset() {
        jobs = []
        currentlyConverting = []
        startedAt = nil
        cancelRequested = false
    }

    private func runJob(at index: Int, ffmpegPath: String, settings: ConversionSettings) async {
        guard !cancelRequested else {
            jobs[index].status = .failed("cancelled before it started")
            return
        }

        let job = jobs[index]
        jobs[index].status = .running
        currentlyConverting.insert(job.file.displayName)
        defer { currentlyConverting.remove(job.file.displayName) }

        let outputDir = job.outputURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

        var arguments = ["-y", "-i", job.file.url.path]
        arguments += settings.ffmpegArguments()
        arguments += [job.outputURL.path]

        let result = await runFFmpeg(jobID: job.id, path: ffmpegPath, arguments: arguments)

        if result.exitCode == 0 {
            jobs[index].status = .done
        } else {
            jobs[index].status = .failed(Self.simplifiedErrorReason(from: result.stderr))
        }
    }

    /// Runs one ffmpeg invocation and returns its exit code and stderr. Registers the
    /// process in activeProcesses for the duration so cancel() can terminate it.
    private func runFFmpeg(jobID: UUID, path: String, arguments: [String]) async -> (exitCode: Int32, stderr: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = arguments

        let errorPipe = Pipe()
        process.standardError = errorPipe
        process.standardOutput = Pipe()

        activeProcesses[jobID] = process

        // readabilityHandler and terminationHandler both fire on Foundation's internal
        // queues, not necessarily the same one, so the shared buffer needs its own
        // locking rather than a plain captured var (which Swift flags as unsafe).
        let collector = StderrCollector()

        let result: (Int32, String) = await withCheckedContinuation { continuation in
            errorPipe.fileHandleForReading.readabilityHandler = { handle in
                let chunk = handle.availableData
                if !chunk.isEmpty { collector.append(chunk) }
            }

            process.terminationHandler = { finished in
                errorPipe.fileHandleForReading.readabilityHandler = nil
                continuation.resume(returning: (finished.terminationStatus, collector.string))
            }

            do {
                try process.run()
            } catch {
                continuation.resume(returning: (-1, error.localizedDescription))
            }
        }

        activeProcesses[jobID] = nil
        return result
    }

    private static func simplifiedErrorReason(from stderr: String) -> String {
        if stderr.contains("Invalid data found") { return "unsupported or corrupted file" }
        if stderr.contains("No such file or directory") { return "file could not be read" }
        if stderr.contains("Permission denied") { return "permission denied" }
        if stderr.contains("Output file does not contain any stream") { return "no audio track found" }
        let lastLine = stderr
            .split(separator: "\n")
            .last(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty })
        return lastLine.map(String.init) ?? "conversion failed"
    }

    private static func resolvedOutputURL(for file: AudioFile, destination: URL, codec: Codec) -> URL {
        let relative = file.relativePath as NSString
        let newRelative = "\(relative.deletingPathExtension).\(codec.fileExtension)"
        return destination.appendingPathComponent(newRelative)
    }

    /// Renames the 2nd, 3rd... colliding output onto " (2)", " (3)" the way Finder
    /// would, since flattened or overlapping folder structures can produce the same
    /// destination path for two different source files.
    private static func deduplicated(_ jobs: [ConversionJob]) -> [ConversionJob] {
        var seenCounts: [String: Int] = [:]
        return jobs.map { original in
            var job = original
            let path = job.outputURL.path
            let count = (seenCounts[path] ?? 0) + 1
            seenCounts[path] = count
            if count > 1 {
                let ext = job.outputURL.pathExtension
                let nameWithoutExt = job.outputURL.deletingPathExtension().lastPathComponent
                let dir = job.outputURL.deletingLastPathComponent()
                job.outputURL = dir
                    .appendingPathComponent("\(nameWithoutExt) (\(count))")
                    .appendingPathExtension(ext)
            }
            return job
        }
    }

    private static func formatDuration(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds / 60)
        if minutes < 1 { return "less than a minute left" }
        if minutes == 1 { return "about 1 minute left" }
        if minutes < 60 { return "about \(minutes) minutes left" }
        let hours = minutes / 60
        return "about \(hours)h \(minutes % 60)m left"
    }
}

/// Lock-guarded byte buffer for accumulating a pipe's output across the two
/// independent callback closures Process invokes on its own internal queues.
private final class StderrCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var data = Data()

    func append(_ chunk: Data) {
        lock.lock()
        data.append(chunk)
        lock.unlock()
    }

    var string: String {
        lock.lock()
        defer { lock.unlock() }
        return String(data: data, encoding: .utf8) ?? ""
    }
}
