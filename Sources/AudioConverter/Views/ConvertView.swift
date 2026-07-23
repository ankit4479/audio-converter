import SwiftUI

struct ConvertView: View {
    var state: AppState

    private var engine: ConversionEngine { state.engine }

    private var finishedCount: Int { engine.completedCount + engine.failedJobs.count }
    private var progress: Double {
        engine.totalCount == 0 ? 0 : Double(finishedCount) / Double(engine.totalCount)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            folderChip
            progressBlock

            if engine.isFinished {
                Spacer(minLength: 16)
                doneCard
                Spacer(minLength: 16)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var folderChip: some View {
        HStack(spacing: 8) {
            Image(systemName: "folder")
                .foregroundStyle(Theme.accent)
            Text("Saving to: \(state.destinationURL?.path ?? "") (\(state.codec.label))")
                .font(.system(size: 12, design: .monospaced))
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
            Button("Change", action: state.cancelAndReturnToSetup)
                .buttonStyle(.plain)
                .font(.caption)
                .foregroundStyle(.secondary)
                .underline()
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 9).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Color.secondary.opacity(0.2)))
    }

    private var progressBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(engine.isFinished
                     ? "Converted \(engine.completedCount) of \(engine.totalCount)"
                     : "Converting \(finishedCount) of \(engine.totalCount)")
                    .font(.system(size: 13, weight: .medium))
                Spacer()
                if let label = engine.estimatedTimeRemainingLabel {
                    Text(label).font(.caption).foregroundStyle(.secondary)
                }
            }
            ProgressView(value: progress)
                .tint(Theme.accent)
            if let name = engine.currentFileName {
                Text("Converting: \(name) to \(state.codec.label)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var doneCard: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle().fill(Theme.success).frame(width: 56, height: 56)
                Image(systemName: "checkmark")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(.white)
            }

            VStack(spacing: 4) {
                Text("\(engine.completedCount) of \(engine.totalCount) songs converted")
                    .font(.system(size: 17, weight: .semibold))
                if !engine.failedJobs.isEmpty {
                    Text("\(engine.failedJobs.count) could not be converted")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }

            if !engine.failedJobs.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(engine.failedJobs.prefix(5)) { job in
                        Text("• \(job.file.displayName) — \(failureReason(job))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if engine.failedJobs.count > 5 {
                        Text("and \(engine.failedJobs.count - 5) more")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: 380, alignment: .leading)
            }

            HStack(spacing: 10) {
                Button("Show in Finder", action: state.revealDestinationInFinder)
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.accent)
                    .foregroundStyle(Theme.accentInk)
                Button("Convert More", action: state.convertMore)
                    .buttonStyle(.bordered)
            }
        }
        .padding(28)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.secondary.opacity(0.2)))
    }

    private func failureReason(_ job: ConversionJob) -> String {
        if case .failed(let reason) = job.status { return reason }
        return "unknown error"
    }
}
