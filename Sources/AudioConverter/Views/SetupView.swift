import SwiftUI
import UniformTypeIdentifiers

/// Each section below is its own View struct, not a computed property, so the
/// Observation framework can tell them apart: a change to state.totalDuration only
/// re-renders FilesBarSection, not the whole screen, so Advanced Settings stays
/// responsive while a background duration scan is still running.
struct SetupView: View {
    var state: AppState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                DropZoneSection(state: state)
                if !state.files.isEmpty {
                    FilesBarSection(state: state)
                    FilesDisclosureSection(state: state)
                }
                FormatPickerSection(state: state)
                AdvancedSettingsSection(state: state)
                ConvertButtonSection(state: state)
            }
            .padding(24)
        }
    }
}

private struct DropZoneSection: View {
    var state: AppState
    @State private var isDropTargeted = false

    var body: some View {
        VStack(spacing: 12) {
            WaveformView()
            Text("Drag songs or folders here")
                .font(.system(size: 15, weight: .semibold))
            Text("MP3, FLAC, WAV, AAC, ALAC, Opus, and more. Mixed formats are fine.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Choose Files or a Folder", action: presentFilePicker)
                .buttonStyle(.borderedProminent)
                .tint(Theme.accent)
                .foregroundStyle(Theme.accentInk)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                .foregroundStyle(isDropTargeted ? Theme.accent : Color.secondary.opacity(0.35))
        )
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .controlBackgroundColor)))
        .onDrop(of: [UTType.fileURL], isTargeted: $isDropTargeted, perform: handleDrop)
    }

    private func presentFilePicker() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = true
        panel.prompt = "Add"
        panel.message = "Choose audio files or folders to convert"
        if panel.runModal() == .OK {
            state.addFiles(from: panel.urls)
        }
    }

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        let relevant = providers.filter { $0.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) }
        guard !relevant.isEmpty else { return false }

        let group = DispatchGroup()
        var urls: [URL] = []
        let lock = NSLock()

        for provider in relevant {
            group.enter()
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                defer { group.leave() }
                var resolved: URL?
                if let data = item as? Data {
                    resolved = URL(dataRepresentation: data, relativeTo: nil)
                } else if let url = item as? URL {
                    resolved = url
                }
                guard let resolved else { return }
                lock.lock()
                urls.append(resolved)
                lock.unlock()
            }
        }

        group.notify(queue: .main) {
            state.addFiles(from: urls)
        }
        return true
    }
}

private struct FilesBarSection: View {
    var state: AppState

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(state.files.count) song\(state.files.count == 1 ? "" : "s") added")
                    .font(.system(size: 14, weight: .semibold))
                Text([state.totalSizeLabel, state.durationLabel].filter { !$0.isEmpty }.joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Clear all", action: state.clearFiles)
                .buttonStyle(.plain)
                .font(.caption)
                .foregroundStyle(.secondary)
                .underline()
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 9).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Color.secondary.opacity(0.2)))
    }
}

private struct FilesDisclosureSection: View {
    var state: AppState

    var body: some View {
        DisclosureGroup("Show the \(state.files.count) files") {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 3) {
                    ForEach(state.files) { file in
                        Text(file.relativePath)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(maxHeight: 140)
        }
        .font(.caption)
    }
}

private struct FormatPickerSection: View {
    @Bindable var state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Convert to").font(.system(size: 13, weight: .semibold))
            Picker("", selection: $state.codec) {
                Section("Common") {
                    ForEach(Codec.allCases.filter { $0.group == .common }) { codec in
                        Text(codec.label).tag(codec)
                    }
                }
                Section("More Formats") {
                    ForEach(Codec.allCases.filter { $0.group == .more }) { codec in
                        Text(codec.label).tag(codec)
                    }
                }
            }
            .labelsHidden()
            .pickerStyle(.menu)

            Text("\(state.codec.tagline) \(state.codec.approxSizePerMinute.prefix(1).uppercased() + state.codec.approxSizePerMinute.dropFirst()).")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private struct AdvancedSettingsSection: View {
    @Bindable var state: AppState

    var body: some View {
        DisclosureGroup("Advanced settings") {
            VStack(alignment: .leading, spacing: 12) {
                switch state.codec.kind {
                case .lossy:
                    Text("Best is tuned so the compression is not audible on real music, not just a bigger number. Lower tiers trade away some of that safety margin for a smaller file.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Picker("Quality", selection: $state.quality) {
                        ForEach(QualityTier.allCases) { tier in
                            Text(tier.label).tag(tier)
                        }
                    }
                case .lossless:
                    Text("Lossless formats always sound identical to the original. This only changes file size and how long conversion takes.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if state.codec.supportsCompressionLevel {
                        Picker("Compression", selection: $state.compression) {
                            ForEach(CompressionTier.allCases) { tier in
                                Text(tier.label).tag(tier)
                            }
                        }
                    }
                case .uncompressed:
                    Text("WAV and AIFF store audio exactly as-is. There is nothing to tune except sample rate.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Picker("Sample rate", selection: $state.sampleRate) {
                    ForEach(SampleRate.allCases) { rate in
                        Text(rate.label).tag(rate)
                    }
                }

                Toggle("Song info and cover art", isOn: $state.keepMetadata)
                    .toggleStyle(.switch)
                    .tint(Theme.accent)
            }
            .padding(.top, 8)
        }
        .font(.caption)
    }
}

private struct ConvertButtonSection: View {
    var state: AppState

    var body: some View {
        HStack {
            Spacer()
            Button {
                state.chooseDestinationAndConvert()
            } label: {
                Text(state.files.isEmpty ? "Convert" : "Convert \(state.files.count) Song\(state.files.count == 1 ? "" : "s")")
                    .fontWeight(.semibold)
                    .padding(.horizontal, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
            .foregroundStyle(Theme.accentInk)
            .disabled(state.files.isEmpty)
        }
    }
}

private struct WaveformView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var grow = false
    private let heights: [CGFloat] = [14, 26, 38, 20, 32, 16, 34, 22, 12]

    var body: some View {
        HStack(alignment: .bottom, spacing: 4) {
            ForEach(heights.indices, id: \.self) { i in
                Capsule()
                    .fill(Theme.accent.opacity(0.75))
                    .frame(width: 4, height: grow ? heights[i] : heights[i] * 0.55)
            }
        }
        .frame(height: 40, alignment: .bottom)
        .onAppear {
            if reduceMotion {
                grow = true
            } else {
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                    grow = true
                }
            }
        }
    }
}
