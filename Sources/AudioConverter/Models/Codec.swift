import Foundation

enum CodecKind {
    case lossy
    case lossless
    case uncompressed
}

enum CodecGroup: String {
    case common = "Common"
    case more = "More Formats"
}

enum QualityTier: Int, CaseIterable, Identifiable {
    case best, good, small

    var id: Int { rawValue }

    var label: String {
        switch self {
        case .best: return "Best, sounds identical to the original (recommended)"
        case .good: return "Good, smaller file, essentially identical for most listeners"
        case .small: return "Small, noticeably smaller file, minor trade-off on complex music"
        }
    }
}

enum CompressionTier: Int, CaseIterable, Identifiable {
    case balanced, fast, smallest

    var id: Int { rawValue }

    var label: String {
        switch self {
        case .balanced: return "Balanced (recommended)"
        case .fast: return "Fast, larger file"
        case .smallest: return "Smallest, slower to convert"
        }
    }

    /// ffmpeg -compression_level for the flac/wavpack encoders (0 = fastest/largest, 8 = slowest/smallest).
    var ffmpegCompressionLevel: String {
        switch self {
        case .balanced: return "5"
        case .fast: return "1"
        case .smallest: return "8"
        }
    }
}

enum SampleRate: Int, CaseIterable, Identifiable {
    case keepOriginal, hz44100, hz48000

    var id: Int { rawValue }

    var label: String {
        switch self {
        case .keepOriginal: return "Keep original"
        case .hz44100: return "44.1 kHz"
        case .hz48000: return "48 kHz"
        }
    }

    var ffmpegValue: String? {
        switch self {
        case .keepOriginal: return nil
        case .hz44100: return "44100"
        case .hz48000: return "48000"
        }
    }
}

enum Codec: String, CaseIterable, Identifiable {
    case mp3, aac, alac, flac, wav, opus, aiff, wavpack, vorbis, wma

    var id: String { rawValue }

    var label: String {
        switch self {
        case .mp3: return "MP3"
        case .aac: return "AAC"
        case .alac: return "Apple Lossless (ALAC)"
        case .flac: return "FLAC"
        case .wav: return "WAV"
        case .opus: return "Opus"
        case .aiff: return "AIFF"
        case .wavpack: return "WavPack"
        case .vorbis: return "Vorbis (OGG)"
        case .wma: return "WMA"
        }
    }

    var tagline: String {
        switch self {
        case .mp3: return "Smaller files. Plays on almost anything."
        case .aac: return "Apple's everyday format. Great quality, small size."
        case .alac: return "Exact copy of the original, made for Music and iTunes."
        case .flac: return "Exact copy of the original, for any player."
        case .wav: return "Uncompressed original. The largest files."
        case .opus: return "The smallest files. Built for streaming and voice."
        case .aiff: return "Uncompressed. Apple's older version of WAV."
        case .wavpack: return "Exact copy of the original, an alternative to FLAC."
        case .vorbis: return "Open source alternative to MP3, similar size and quality."
        case .wma: return "For older Windows software. Rarely needed today."
        }
    }

    var approxSizePerMinute: String {
        switch self {
        case .mp3: return "about 2.4 MB per minute"
        case .aac: return "about 1.9 MB per minute"
        case .alac: return "about 6 MB per minute"
        case .flac: return "about 6 MB per minute"
        case .wav: return "about 10 MB per minute"
        case .opus: return "about 1.2 MB per minute"
        case .aiff: return "about 10 MB per minute"
        case .wavpack: return "about 6 MB per minute"
        case .vorbis: return "about 2 MB per minute"
        case .wma: return "about 2 MB per minute"
        }
    }

    var kind: CodecKind {
        switch self {
        case .mp3, .aac, .opus, .vorbis, .wma: return .lossy
        case .alac, .flac, .wavpack: return .lossless
        case .wav, .aiff: return .uncompressed
        }
    }

    var group: CodecGroup {
        switch self {
        case .mp3, .aac, .alac, .flac, .wav, .opus: return .common
        case .aiff, .wavpack, .vorbis, .wma: return .more
        }
    }

    var fileExtension: String {
        switch self {
        case .mp3: return "mp3"
        case .aac: return "m4a"
        case .alac: return "m4a"
        case .flac: return "flac"
        case .wav: return "wav"
        case .opus: return "opus"
        case .aiff: return "aiff"
        case .wavpack: return "wv"
        case .vorbis: return "ogg"
        case .wma: return "wma"
        }
    }

    /// Formats where ffmpeg's -compression_level flag actually changes encoder behavior.
    /// ALAC's ffmpeg encoder has no tunable level, so the Advanced Settings compression
    /// row is hidden for it rather than shown but silently ignored.
    var supportsCompressionLevel: Bool {
        switch self {
        case .flac, .wavpack: return true
        default: return false
        }
    }

    /// Formats where embedded cover art round-trips reliably through ffmpeg's muxer.
    var supportsEmbeddedArt: Bool {
        switch self {
        case .mp3, .flac, .alac, .aac: return true
        default: return false
        }
    }
}

struct ConversionSettings {
    var codec: Codec
    var quality: QualityTier = .best
    var compression: CompressionTier = .balanced
    var sampleRate: SampleRate = .keepOriginal
    var keepMetadata: Bool = true

    /// Builds the ffmpeg arguments for this codec/settings combination.
    /// Does not include -i <input> or the output path; the caller appends those.
    func ffmpegArguments() -> [String] {
        var args: [String] = []

        args += ["-map_metadata", keepMetadata ? "0" : "-1"]

        if codec.supportsEmbeddedArt {
            // Map the audio stream plus an optional attached-picture video stream,
            // copying the art untouched instead of re-encoding it as a video frame.
            args += ["-map", "0:a", "-map", "0:v?", "-c:v", "copy"]
        } else {
            args += ["-map", "0:a"]
        }

        switch codec {
        case .mp3:
            args += ["-c:a", "libmp3lame", "-q:a", mp3QualityScale]
        case .aac, .alac:
            args += ["-c:a", codec == .aac ? "aac" : "alac"]
            if codec == .aac {
                args += ["-b:a", aacBitrate]
            }
        case .flac:
            args += ["-c:a", "flac", "-compression_level", compression.ffmpegCompressionLevel]
        case .wav:
            args += ["-c:a", "pcm_s16le"]
        case .opus:
            args += ["-c:a", "libopus", "-b:a", opusBitrate, "-vbr", "on"]
        case .aiff:
            args += ["-c:a", "pcm_s16be"]
        case .wavpack:
            args += ["-c:a", "wavpack", "-compression_level", compression.ffmpegCompressionLevel]
        case .vorbis:
            // ffmpeg's native vorbis encoder is still flagged experimental in this
            // build, -strict -2 opts in; libvorbis isn't compiled into this ffmpeg.
            args += ["-c:a", "vorbis", "-strict", "-2", "-q:a", vorbisQualityScale]
        case .wma:
            args += ["-c:a", "wmav2", "-b:a", wmaBitrate]
        }

        if let rate = sampleRate.ffmpegValue {
            args += ["-ar", rate]
        }

        return args
    }

    // libmp3lame VBR quality: 0 is best (~245 kbps average) down through 9 (worst).
    private var mp3QualityScale: String {
        switch quality {
        case .best: return "0"
        case .good: return "2"
        case .small: return "5"
        }
    }

    private var aacBitrate: String {
        switch quality {
        case .best: return "256k"
        case .good: return "192k"
        case .small: return "128k"
        }
    }

    private var opusBitrate: String {
        switch quality {
        case .best: return "160k"
        case .good: return "128k"
        case .small: return "96k"
        }
    }

    // ffmpeg's native vorbis encoder: -q:a ranges roughly -1 (worst) to 10 (best).
    private var vorbisQualityScale: String {
        switch quality {
        case .best: return "8"
        case .good: return "6"
        case .small: return "4"
        }
    }

    private var wmaBitrate: String {
        switch quality {
        case .best: return "192k"
        case .good: return "160k"
        case .small: return "128k"
        }
    }
}
