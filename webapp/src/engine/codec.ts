/**
 * Codec model ported from Sources/AudioConverter/Models/Codec.swift. Plain data
 * plus a browser-availability layer — no React, no DOM, no encoding logic. Meant
 * to be importable from a Web Worker (the conversion engine, issue #4) as freely
 * as from UI code (issues #14/#15).
 */

export type CodecKind = 'lossy' | 'lossless' | 'uncompressed'
export type CodecGroup = 'common' | 'more'

/**
 * Browser support for a format, distinct from the Mac app (which has none of
 * this — ffmpeg either has the encoder compiled in or it doesn't).
 *  - supported: works today, either via a native browser encoder or a bundled
 *    WASM one.
 *  - runtimeDetected: browsers disagree on support; only `AudioEncoder
 *    .isConfigSupported()` at runtime can say for sure (see issue #6).
 *  - unsupportedInBrowser: no realistic browser or WASM encoder exists.
 */
export type CodecAvailability = 'supported' | 'runtimeDetected' | 'unsupportedInBrowser'

export type QualityTier = 'best' | 'good' | 'small'
export type CompressionTier = 'balanced' | 'fast' | 'smallest'
export type SampleRate = 'keepOriginal' | 'hz44100' | 'hz48000'
export type CodecId =
  'mp3' | 'aac' | 'alac' | 'flac' | 'wav' | 'opus' | 'aiff' | 'wavpack' | 'vorbis' | 'wma'

export const QUALITY_TIERS: readonly QualityTier[] = ['best', 'good', 'small']
export const COMPRESSION_TIERS: readonly CompressionTier[] = [
  'balanced',
  'fast',
  'smallest',
]
export const SAMPLE_RATES: readonly SampleRate[] = ['keepOriginal', 'hz44100', 'hz48000']
export const CODEC_IDS: readonly CodecId[] = [
  'mp3',
  'aac',
  'alac',
  'flac',
  'wav',
  'opus',
  'aiff',
  'wavpack',
  'vorbis',
  'wma',
]

// Codec.swift:19-25
export const QUALITY_TIER_LABEL: Readonly<Record<QualityTier, string>> = {
  best: 'Best, sounds identical to the original (recommended)',
  good: 'Good, smaller file, essentially identical for most listeners',
  small: 'Small, noticeably smaller file, minor trade-off on complex music',
}

// Codec.swift:33-39
export const COMPRESSION_TIER_LABEL: Readonly<Record<CompressionTier, string>> = {
  balanced: 'Balanced (recommended)',
  fast: 'Fast, larger file',
  smallest: 'Smallest, slower to convert',
}

// Codec.swift:42-48 - compression level for the flac/wavpack encoders
// (0 = fastest/largest, 8 = slowest/smallest). Ported as a generic level, not an
// ffmpeg flag; issue #6 (FLAC) and a future WavPack decision consume it directly.
export const COMPRESSION_TIER_LEVEL: Readonly<Record<CompressionTier, string>> = {
  balanced: '5',
  fast: '1',
  smallest: '8',
}

// Codec.swift:56-62
export const SAMPLE_RATE_LABEL: Readonly<Record<SampleRate, string>> = {
  keepOriginal: 'Keep original',
  hz44100: '44.1 kHz',
  hz48000: '48 kHz',
}

// Codec.swift:64-70 - undefined means "don't resample", matching ffmpegValue's nil.
export const SAMPLE_RATE_HZ: Readonly<Record<SampleRate, number | undefined>> = {
  keepOriginal: undefined,
  hz44100: 44100,
  hz48000: 48000,
}

export interface CodecDefinition {
  readonly label: string
  readonly tagline: string
  readonly approxSizePerMinute: string
  readonly kind: CodecKind
  readonly group: CodecGroup
  readonly fileExtension: string
  readonly supportsCompressionLevel: boolean
  readonly supportsEmbeddedArt: boolean
  readonly availability: CodecAvailability
}

// Codec.swift:78-169. Labels, taglines, and size estimates are copied character
// for character from the Swift source.
export const CODECS: Readonly<Record<CodecId, CodecDefinition>> = {
  mp3: {
    label: 'MP3',
    tagline: 'Smaller files. Plays on almost anything.',
    approxSizePerMinute: 'about 2.4 MB per minute',
    kind: 'lossy',
    group: 'common',
    fileExtension: 'mp3',
    supportsCompressionLevel: false,
    supportsEmbeddedArt: true,
    // Issue #5: WASM (LAME) encoder, always available regardless of browser.
    availability: 'supported',
  },
  aac: {
    label: 'AAC',
    tagline: "Apple's everyday format. Great quality, small size.",
    approxSizePerMinute: 'about 1.9 MB per minute',
    kind: 'lossy',
    group: 'common',
    fileExtension: 'm4a',
    supportsCompressionLevel: false,
    supportsEmbeddedArt: true,
    availability: 'supported',
  },
  alac: {
    label: 'Apple Lossless (ALAC)',
    tagline: 'Exact copy of the original, made for Music and iTunes.',
    approxSizePerMinute: 'about 6 MB per minute',
    kind: 'lossless',
    group: 'common',
    fileExtension: 'm4a',
    supportsCompressionLevel: false,
    supportsEmbeddedArt: true,
    // No browser or realistic WASM encoder exists. See issue #13.
    availability: 'unsupportedInBrowser',
  },
  flac: {
    label: 'FLAC',
    tagline: 'Exact copy of the original, for any player.',
    approxSizePerMinute: 'about 6 MB per minute',
    kind: 'lossless',
    group: 'common',
    fileExtension: 'flac',
    supportsCompressionLevel: true,
    supportsEmbeddedArt: true,
    // Issue #6: WebCodecs where available, WASM fallback otherwise - either
    // way it works, so this is "supported" rather than "runtimeDetected".
    availability: 'supported',
  },
  wav: {
    label: 'WAV',
    tagline: 'Uncompressed original. The largest files.',
    approxSizePerMinute: 'about 10 MB per minute',
    kind: 'uncompressed',
    group: 'common',
    fileExtension: 'wav',
    supportsCompressionLevel: false,
    supportsEmbeddedArt: false,
    // Issue #7: written directly, no codec involved.
    availability: 'supported',
  },
  opus: {
    label: 'Opus',
    tagline: 'The smallest files. Built for streaming and voice.',
    approxSizePerMinute: 'about 1.2 MB per minute',
    kind: 'lossy',
    group: 'common',
    fileExtension: 'opus',
    supportsCompressionLevel: false,
    supportsEmbeddedArt: false,
    availability: 'supported',
  },
  aiff: {
    label: 'AIFF',
    tagline: "Uncompressed. Apple's older version of WAV.",
    approxSizePerMinute: 'about 10 MB per minute',
    kind: 'uncompressed',
    group: 'more',
    fileExtension: 'aiff',
    supportsCompressionLevel: false,
    supportsEmbeddedArt: false,
    availability: 'supported',
  },
  wavpack: {
    label: 'WavPack',
    tagline: 'Exact copy of the original, an alternative to FLAC.',
    approxSizePerMinute: 'about 6 MB per minute',
    kind: 'lossless',
    group: 'more',
    fileExtension: 'wv',
    supportsCompressionLevel: true,
    supportsEmbeddedArt: false,
    // No browser or realistic WASM encoder exists. See issue #13.
    availability: 'unsupportedInBrowser',
  },
  vorbis: {
    label: 'Vorbis (OGG)',
    tagline: 'Open source alternative to MP3, similar size and quality.',
    approxSizePerMinute: 'about 2 MB per minute',
    kind: 'lossy',
    group: 'more',
    fileExtension: 'ogg',
    supportsCompressionLevel: false,
    supportsEmbeddedArt: false,
    // Provisional default pending the issue #12 spike. Flip to 'supported' or
    // 'runtimeDetected' there if a viable WASM encoder is found; otherwise this
    // stays and Vorbis joins ALAC/WavPack/WMA in issue #13's messaging.
    availability: 'unsupportedInBrowser',
  },
  wma: {
    label: 'WMA',
    tagline: 'For older Windows software. Rarely needed today.',
    approxSizePerMinute: 'about 2 MB per minute',
    kind: 'lossy',
    group: 'more',
    fileExtension: 'wma',
    supportsCompressionLevel: false,
    supportsEmbeddedArt: false,
    // No browser or realistic WASM encoder exists. See issue #13.
    availability: 'unsupportedInBrowser',
  },
}

export interface ConversionSettings {
  codec: CodecId
  quality: QualityTier
  compression: CompressionTier
  sampleRate: SampleRate
  keepMetadata: boolean
}

// ConversionSettings.mp3QualityScale (Codec.swift:228-234).
// libmp3lame VBR quality: 0 is best (~245 kbps average) down through 9 (worst).
export function mp3QualityScale(quality: QualityTier): string {
  return { best: '0', good: '2', small: '5' }[quality]
}

// ConversionSettings.aacBitrate (Codec.swift:236-242)
export function aacBitrate(quality: QualityTier): string {
  return { best: '256k', good: '192k', small: '128k' }[quality]
}

// ConversionSettings.opusBitrate (Codec.swift:244-250)
export function opusBitrate(quality: QualityTier): string {
  return { best: '160k', good: '128k', small: '96k' }[quality]
}

// ConversionSettings.vorbisQualityScale (Codec.swift:252-259)
// ffmpeg's native vorbis encoder: -q:a ranges roughly -1 (worst) to 10 (best).
export function vorbisQualityScale(quality: QualityTier): string {
  return { best: '8', good: '6', small: '4' }[quality]
}

// ConversionSettings.wmaBitrate (Codec.swift:261-267)
export function wmaBitrate(quality: QualityTier): string {
  return { best: '192k', good: '160k', small: '128k' }[quality]
}
