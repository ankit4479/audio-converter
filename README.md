# Audio Converter

A native macOS audio converter. Drop in files or whole folders, pick a format, get them
back converted. Everything happens on your machine — nothing is uploaded anywhere.

Built with SwiftUI, using [ffmpeg](https://ffmpeg.org) as the conversion engine.

## Formats

| | Format | Notes |
|---|---|---|
| **Lossy** | MP3, AAC, Opus, Vorbis, WMA | Smaller files, some quality traded away |
| **Lossless** | FLAC, ALAC, WavPack | Exact copy of the original, compressed |
| **Uncompressed** | WAV, AIFF | Largest files, no processing at all |

Each format has three quality or compression presets, described in plain language rather
than bitrates, so you don't have to know what 192 kbps means to make a sensible choice.

Other things it does:

- **Batch conversion**, running several files at once. Concurrency is set from your core
  count, capped so the machine stays usable while it works.
- **Keeps metadata and cover art** where the target format supports it (MP3, FLAC, ALAC,
  AAC). Where a format can't carry artwork reliably, it doesn't pretend to.
- **Sample rate control** — keep the original, or force 44.1/48 kHz.
- **Live progress** with a running estimate of time remaining, and per-file error
  reporting rather than one silent failure at the end.

## Requirements

- macOS 14 or later
- **ffmpeg installed on your system.** The app doesn't bundle it, it finds yours:

```sh
brew install ffmpeg
```

Homebrew (Apple Silicon and Intel), MacPorts, and anything already on your `PATH` are all
detected automatically.

> ffmpeg is deliberately not bundled. Shipping it inside the app would pull ffmpeg's own
> licensing terms onto this project, and you very likely have it already.

## Install

Download the `.dmg` from [Releases](https://github.com/ankit4479/audio-converter/releases),
open it, and drag the app to Applications.

**The app is not code-signed or notarised**, so on first launch macOS will refuse to open
it. This is expected for an unsigned build, not a sign that anything is wrong:

1. Right-click (or Control-click) the app in Applications
2. Choose **Open**
3. Click **Open** again in the dialog

You only have to do this once. If you'd rather not run an unsigned binary, build it
yourself — it takes about a minute.

## Build from source

```sh
git clone https://github.com/ankit4479/audio-converter.git
cd audio-converter
swift build -c release
```

To produce the bundled `.app` and a distributable `.dmg`:

```sh
./Scripts/build-app.sh
./Scripts/make-dmg.sh
```

Both write into `build/`, which is gitignored.

## Layout

```
Sources/AudioConverter/
  AudioConverterApp.swift   app entry point
  AppState.swift            top-level state
  ContentView.swift         window shell
  Theme.swift               colour and type tokens
  Models/
    Codec.swift             formats, quality tiers, ffmpeg argument construction
    AudioFile.swift         an input file
  Views/
    SetupView.swift         pick files and settings
    ConvertView.swift       progress and results
  Services/
    ConversionEngine.swift  job queue, concurrency, cancellation
    FFmpegLocator.swift     finds ffmpeg on the system
    FileIntake.swift        file and folder intake
```

## License

MIT. See [LICENSE](LICENSE).
