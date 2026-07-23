/**
 * Maps our CodecId (codec.ts) to the Mediabunny OutputFormat + AudioCodec pair that
 * produces it, plus the correct file extension and MIME type for the *audio* file we
 * actually want — Mediabunny's own `OutputFormat.fileExtension`/`mimeType` getters are
 * generic/video-oriented (Mp4OutputFormat reports '.mp4' and 'video/mp4', since MP4 is
 * usually video), which would be wrong for an audio-only .m4a. CODECS' own
 * fileExtension (codec.ts, ported from Codec.swift) is the source of truth for the
 * saved filename instead.
 *
 * `null` means "not implemented yet":
 *  - AAC/Opus/FLAC (#6): straightforward `bitrate: number` for AAC/Opus (parse
 *    aacBitrate()/opusBitrate()'s "256k" strings into bps), but Mediabunny's
 *    ConversionAudioOptions has no compression-level knob at all, so FLAC's
 *    balanced/fast/smallest tiers (Codec.swift's -compression_level) may have no
 *    browser equivalent — needs confirming against Mediabunny's FLAC encoder options.
 *  - AIFF (#7): no Mediabunny OutputFormat exists for AIFF at all (its format list is
 *    MP4/MOV/WebM/MKV/HLS/WAVE/MP3/Ogg/ADTS/FLAC/MPEG-TS) — needs a hand-written writer
 *    reading decoded PCM directly, bypassing this table entirely.
 *  - Vorbis (#12): pending the viability spike; Mediabunny's AudioCodec union includes
 *    'vorbis', but WebCodecs Vorbis *encode* support is unconfirmed in any browser.
 *  - ALAC/WavPack/WMA: no Mediabunny encoder exists (its AudioCodec union has no such
 *    values) — permanently null, see issue #13.
 */
import { Mp3OutputFormat, WavOutputFormat } from 'mediabunny'
import type { AudioCodec } from 'mediabunny'
import { CODECS, type CodecId, type ConversionSettings } from './codec'
import { ensureMp3EncoderRegistered, mp3BitrateForQuality } from './mp3'

export interface EncodableFormat {
  /** Builds a fresh OutputFormat instance. A factory, not a shared instance, since
   *  Output takes ownership of the format instance it's constructed with. */
  createFormat: () => InstanceType<typeof WavOutputFormat | typeof Mp3OutputFormat>
  audioCodec: AudioCodec
  mimeType: string
  /** undefined when the codec has no bitrate concept at all (WAV). */
  resolveBitrate?: (settings: ConversionSettings) => number
  /** Called once before the first conversion that needs this format. Used to lazily
   *  load a WASM encoder only when it's actually needed (issue #5's acceptance
   *  criterion: the MP3 WASM chunk must be absent from the initial page load). */
  ensureReady?: () => Promise<void>
}

export const ENCODABLE_FORMATS: Readonly<Record<CodecId, EncodableFormat | null>> = {
  wav: {
    createFormat: () => new WavOutputFormat(),
    // Codec.swift uses pcm_s16le; Mediabunny's little-endian 16-bit PCM id is 'pcm-s16'.
    audioCodec: 'pcm-s16',
    mimeType: 'audio/wav',
  },
  mp3: {
    createFormat: () => new Mp3OutputFormat(),
    audioCodec: 'mp3',
    mimeType: 'audio/mpeg',
    resolveBitrate: (settings) => mp3BitrateForQuality(settings.quality),
    ensureReady: ensureMp3EncoderRegistered,
  },
  aac: null,
  flac: null,
  opus: null,
  aiff: null,
  alac: null,
  wavpack: null,
  vorbis: null,
  wma: null,
}

export function encodableFormatFor(codec: CodecId): EncodableFormat | null {
  return ENCODABLE_FORMATS[codec]
}

export function outputFileName(baseName: string, codec: CodecId): string {
  return `${baseName}.${CODECS[codec].fileExtension}`
}
