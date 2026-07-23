// @vitest-environment node
//
// Runs in the plain Node environment (no jsdom, no `window`/`document`) rather
// than the project's default jsdom environment, so an accidental DOM or React
// import in codec.ts would fail this file specifically — the acceptance
// criterion that this module stays usable from a Web Worker, checked directly
// rather than by inspection.
import { describe, expect, it } from 'vitest'
import {
  CODEC_IDS,
  CODECS,
  COMPRESSION_TIER_LABEL,
  COMPRESSION_TIER_LEVEL,
  COMPRESSION_TIERS,
  QUALITY_TIER_LABEL,
  QUALITY_TIERS,
  SAMPLE_RATE_HZ,
  SAMPLE_RATE_LABEL,
  SAMPLE_RATES,
  aacBitrate,
  mp3QualityScale,
  opusBitrate,
  vorbisQualityScale,
  wmaBitrate,
  type CodecId,
  type QualityTier,
} from './codec'

// Character-for-character against Sources/AudioConverter/Models/Codec.swift.
const EXPECTED: Record<
  CodecId,
  { label: string; tagline: string; approxSizePerMinute: string }
> = {
  mp3: {
    label: 'MP3',
    tagline: 'Smaller files. Plays on almost anything.',
    approxSizePerMinute: 'about 2.4 MB per minute',
  },
  aac: {
    label: 'AAC',
    tagline: "Apple's everyday format. Great quality, small size.",
    approxSizePerMinute: 'about 1.9 MB per minute',
  },
  alac: {
    label: 'Apple Lossless (ALAC)',
    tagline: 'Exact copy of the original, made for Music and iTunes.',
    approxSizePerMinute: 'about 6 MB per minute',
  },
  flac: {
    label: 'FLAC',
    tagline: 'Exact copy of the original, for any player.',
    approxSizePerMinute: 'about 6 MB per minute',
  },
  wav: {
    label: 'WAV',
    tagline: 'Uncompressed original. The largest files.',
    approxSizePerMinute: 'about 10 MB per minute',
  },
  opus: {
    label: 'Opus',
    tagline: 'The smallest files. Built for streaming and voice.',
    approxSizePerMinute: 'about 1.2 MB per minute',
  },
  aiff: {
    label: 'AIFF',
    tagline: "Uncompressed. Apple's older version of WAV.",
    approxSizePerMinute: 'about 10 MB per minute',
  },
  wavpack: {
    label: 'WavPack',
    tagline: 'Exact copy of the original, an alternative to FLAC.',
    approxSizePerMinute: 'about 6 MB per minute',
  },
  vorbis: {
    label: 'Vorbis (OGG)',
    tagline: 'Open source alternative to MP3, similar size and quality.',
    approxSizePerMinute: 'about 2 MB per minute',
  },
  wma: {
    label: 'WMA',
    tagline: 'For older Windows software. Rarely needed today.',
    approxSizePerMinute: 'about 2 MB per minute',
  },
}

describe('CODECS', () => {
  it('has exactly the 10 codecs the Mac app has, in the same order', () => {
    expect(CODEC_IDS).toEqual([
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
    ])
  })

  it.each(CODEC_IDS)('%s matches the Swift source character for character', (id) => {
    expect(CODECS[id].label).toBe(EXPECTED[id].label)
    expect(CODECS[id].tagline).toBe(EXPECTED[id].tagline)
    expect(CODECS[id].approxSizePerMinute).toBe(EXPECTED[id].approxSizePerMinute)
  })

  it('groups codecs exactly as Codec.group does (Codec.swift:131-136)', () => {
    const common = CODEC_IDS.filter((id) => CODECS[id].group === 'common')
    const more = CODEC_IDS.filter((id) => CODECS[id].group === 'more')
    expect(common).toEqual(['mp3', 'aac', 'alac', 'flac', 'wav', 'opus'])
    expect(more).toEqual(['aiff', 'wavpack', 'vorbis', 'wma'])
  })

  it('classifies kind exactly as Codec.kind does (Codec.swift:123-129)', () => {
    const byKind = {
      lossy: [] as CodecId[],
      lossless: [] as CodecId[],
      uncompressed: [] as CodecId[],
    }
    for (const id of CODEC_IDS) byKind[CODECS[id].kind].push(id)
    expect(byKind.lossy).toEqual(['mp3', 'aac', 'opus', 'vorbis', 'wma'])
    expect(byKind.lossless).toEqual(['alac', 'flac', 'wavpack'])
    expect(byKind.uncompressed).toEqual(['wav', 'aiff'])
  })

  it('sets fileExtension exactly as Codec.fileExtension does (Codec.swift:138-151)', () => {
    const extensions = Object.fromEntries(
      CODEC_IDS.map((id) => [id, CODECS[id].fileExtension]),
    )
    expect(extensions).toEqual({
      mp3: 'mp3',
      aac: 'm4a',
      alac: 'm4a',
      flac: 'flac',
      wav: 'wav',
      opus: 'opus',
      aiff: 'aiff',
      wavpack: 'wv',
      vorbis: 'ogg',
      wma: 'wma',
    })
  })

  it('sets supportsCompressionLevel only for flac and wavpack (Codec.swift:156-161)', () => {
    const supporting = CODEC_IDS.filter((id) => CODECS[id].supportsCompressionLevel)
    expect(supporting).toEqual(['flac', 'wavpack'])
  })

  it('sets supportsEmbeddedArt only for mp3, flac, alac, aac (Codec.swift:164-169)', () => {
    const supporting = CODEC_IDS.filter((id) => CODECS[id].supportsEmbeddedArt)
    // Order here reflects CODEC_IDS' declaration order, not the Swift switch
    // statement's case list, so this compares as a set.
    expect(new Set(supporting)).toEqual(new Set(['mp3', 'flac', 'alac', 'aac']))
  })

  it('marks ALAC, WavPack, and WMA unsupported, with Vorbis provisionally unsupported pending #12', () => {
    expect(CODECS.alac.availability).toBe('unsupportedInBrowser')
    expect(CODECS.wavpack.availability).toBe('unsupportedInBrowser')
    expect(CODECS.wma.availability).toBe('unsupportedInBrowser')
    expect(CODECS.vorbis.availability).toBe('unsupportedInBrowser')
  })

  it('marks MP3, FLAC, WAV, and AIFF supported (native or a bundled WASM fallback works regardless of browser)', () => {
    for (const id of ['mp3', 'flac', 'wav', 'aiff'] as const) {
      expect(CODECS[id].availability).toBe('supported')
    }
  })

  it('marks AAC and Opus runtimeDetected (issue #6: no WASM fallback exists for either, so real availability depends on the browser)', () => {
    for (const id of ['aac', 'opus'] as const) {
      expect(CODECS[id].availability).toBe('runtimeDetected')
    }
  })
})

describe('quality, compression, and sample rate labels', () => {
  it('matches QualityTier.label exactly (Codec.swift:19-25)', () => {
    expect(QUALITY_TIERS).toEqual(['best', 'good', 'small'])
    expect(QUALITY_TIER_LABEL.best).toBe(
      'Best, sounds identical to the original (recommended)',
    )
    expect(QUALITY_TIER_LABEL.good).toBe(
      'Good, smaller file, essentially identical for most listeners',
    )
    expect(QUALITY_TIER_LABEL.small).toBe(
      'Small, noticeably smaller file, minor trade-off on complex music',
    )
  })

  it('matches CompressionTier.label and ffmpegCompressionLevel exactly (Codec.swift:33-48)', () => {
    expect(COMPRESSION_TIERS).toEqual(['balanced', 'fast', 'smallest'])
    expect(COMPRESSION_TIER_LABEL.balanced).toBe('Balanced (recommended)')
    expect(COMPRESSION_TIER_LABEL.fast).toBe('Fast, larger file')
    expect(COMPRESSION_TIER_LABEL.smallest).toBe('Smallest, slower to convert')
    expect(COMPRESSION_TIER_LEVEL).toEqual({ balanced: '5', fast: '1', smallest: '8' })
  })

  it('matches SampleRate.label and ffmpegValue exactly (Codec.swift:56-70)', () => {
    expect(SAMPLE_RATES).toEqual(['keepOriginal', 'hz44100', 'hz48000'])
    expect(SAMPLE_RATE_LABEL).toEqual({
      keepOriginal: 'Keep original',
      hz44100: '44.1 kHz',
      hz48000: '48 kHz',
    })
    expect(SAMPLE_RATE_HZ).toEqual({
      keepOriginal: undefined,
      hz44100: 44100,
      hz48000: 48000,
    })
  })
})

describe('per-codec quality tier mapping (ConversionSettings, Codec.swift:227-267)', () => {
  const TIERS: QualityTier[] = ['best', 'good', 'small']

  it('maps MP3 to libmp3lame VBR 0/2/5', () => {
    expect(TIERS.map(mp3QualityScale)).toEqual(['0', '2', '5'])
  })

  it('maps AAC to 256k/192k/128k', () => {
    expect(TIERS.map(aacBitrate)).toEqual(['256k', '192k', '128k'])
  })

  it('maps Opus to 160k/128k/96k', () => {
    expect(TIERS.map(opusBitrate)).toEqual(['160k', '128k', '96k'])
  })

  it('maps Vorbis to q8/q6/q4', () => {
    expect(TIERS.map(vorbisQualityScale)).toEqual(['8', '6', '4'])
  })

  it('maps WMA to 192k/160k/128k', () => {
    expect(TIERS.map(wmaBitrate)).toEqual(['192k', '160k', '128k'])
  })

  it('maps FLAC and WavPack compression to level 5/1/8 via CompressionTier, not a quality tier', () => {
    expect(CODECS.flac.supportsCompressionLevel).toBe(true)
    expect(CODECS.wavpack.supportsCompressionLevel).toBe(true)
    expect(
      ['balanced', 'fast', 'smallest'].map((t) => COMPRESSION_TIER_LEVEL[t as never]),
    ).toEqual(['5', '1', '8'])
  })

  it('has no quality or compression knob for ALAC, WAV, or AIFF, matching ffmpegArguments never tuning them', () => {
    for (const id of ['alac', 'wav', 'aiff'] as const) {
      expect(CODECS[id].supportsCompressionLevel).toBe(false)
    }
  })
})
