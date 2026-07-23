import Foundation
import AppKit
import Observation

@MainActor
@Observable
final class AppState {
    enum Screen {
        case setup
        case convert
    }

    var files: [AudioFile] = []
    var totalDuration: TimeInterval = 0
    var isCalculatingDuration = false
    var codec: Codec = .flac
    var quality: QualityTier = .best
    var compression: CompressionTier = .balanced
    var sampleRate: SampleRate = .keepOriginal
    var keepMetadata = true
    var destinationURL: URL?
    var screen: Screen = .setup

    let engine = ConversionEngine()

    private var durationGeneration = 0

    var settings: ConversionSettings {
        ConversionSettings(
            codec: codec,
            quality: quality,
            compression: compression,
            sampleRate: sampleRate,
            keepMetadata: keepMetadata
        )
    }

    var totalSizeLabel: String {
        let bytes = files.reduce(Int64(0)) { $0 + $1.fileSize }
        return ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }

    var durationLabel: String {
        if totalDuration > 0 {
            let hours = Int(totalDuration) / 3600
            let minutes = (Int(totalDuration) % 3600) / 60
            return hours > 0 ? "about \(hours)h \(minutes)m of music" : "about \(minutes)m of music"
        }
        return isCalculatingDuration ? "Calculating duration…" : ""
    }

    func addFiles(from urls: [URL]) {
        let scanned = FileIntake.scan(urls: urls)
        guard !scanned.isEmpty else { return }
        var existingPaths = Set(files.map(\.url.path))
        let newFiles = scanned.filter { existingPaths.insert($0.url.path).inserted }
        guard !newFiles.isEmpty else { return }
        files.append(contentsOf: newFiles)
        recalculateDuration()
    }

    func clearFiles() {
        files = []
        totalDuration = 0
        isCalculatingDuration = false
        durationGeneration += 1
    }

    private func recalculateDuration() {
        durationGeneration += 1
        let generation = durationGeneration
        isCalculatingDuration = true
        let snapshot = files
        Task {
            let total = await FileIntake.totalDuration(of: snapshot)
            guard generation == durationGeneration else { return }
            totalDuration = total
            isCalculatingDuration = false
        }
    }

    /// Prompts for a destination folder, then kicks off the batch. Returns to the
    /// caller immediately; screen already switched to .convert so progress shows live.
    func chooseDestinationAndConvert() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose"
        panel.message = "Choose a folder to save your converted songs"

        guard panel.runModal() == .OK, let url = panel.url else { return }

        destinationURL = url
        screen = .convert
        let batch = files
        let batchSettings = settings
        Task {
            await engine.start(files: batch, destination: url, settings: batchSettings)
        }
    }

    func cancelAndReturnToSetup() {
        engine.cancel()
        screen = .setup
    }

    func convertMore() {
        engine.reset()
        clearFiles()
        screen = .setup
    }

    func revealDestinationInFinder() {
        guard let destinationURL else { return }
        NSWorkspace.shared.activateFileViewerSelecting([destinationURL])
    }
}
