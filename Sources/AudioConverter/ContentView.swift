import SwiftUI

struct ContentView: View {
    @State private var state = AppState()

    var body: some View {
        Group {
            if state.engine.ffmpegPath == nil {
                MissingFFmpegView()
            } else {
                switch state.screen {
                case .setup:
                    SetupView(state: state)
                case .convert:
                    ConvertView(state: state)
                }
            }
        }
        .frame(width: 680, height: 720)
    }
}

private struct MissingFFmpegView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 32))
                .foregroundStyle(.secondary)
            Text("FFmpeg not found")
                .font(.headline)
            Text("This app converts audio using FFmpeg, which usually comes from Homebrew. Install it with \"brew install ffmpeg\" in Terminal, then relaunch.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 360)
        }
        .padding(40)
    }
}
