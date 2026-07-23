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
 *  - AIFF (#7): no Mediabunny OutputFormat exists for AIFF at all (its format list is
 *    MP4/MOV/WebM/MKV/HLS/WAVE/MP3/Ogg/ADTS/FLAC/MPEG-TS) — needs a hand-written writer
 *    reading decoded PCM directly, bypassing this table entirely.
 *  - Vorbis (#12): pending the viability spike; Mediabunny's AudioCodec union includes
 *    'vorbis', but WebCodecs Vorbis *encode* support is unconfirmed in any browser.
 *  - ALAC/WavPack/WMA: no Mediabunny encoder exists (its AudioCodec union has no such
 *    values) — permanently null, see issue #13.
 */
import {
  FlacOutputFormat,
  Mp3OutputFormat,
  Mp4OutputFormat,
  OggOutputFormat,
  WavOutputFormat,
} from 'mediabunny'
import type { AudioCodec } from 'mediabunny'
import {
  aacBitrate,
  CODECS,
  opusBitrate,
  type CodecId,
  type ConversionSettings,
} from './codec'
import { ensureFlacEncoderRegistered } from './flac'
import { ensureMp3EncoderRegistered, mp3BitrateForQuality } from './mp3'
import { ensureWebCodecsSupport, kbpsStringToBps } from './webcodecs'

export interface EncodableFormat {
  /** Builds a fresh OutputFormat instance. A factory, not a shared instance, since
   *  Output takes ownership of the format instance it's constructed with. */
  createFormat: () => InstanceType<
    | typeof WavOutputFormat
    | typeof Mp3OutputFormat
    | typeof Mp4OutputFormat
    | typeof OggOutputFormat
    | typeof FlacOutputFormat
  >
  audioCodec: AudioCodec
  mimeType: string
  /** undefined when the codec has no bitrate concept at all (WAV, FLAC). */
  resolveBitrate?: (settings: ConversionSettings) => number
  /** Called once before the first conversion that needs this format. Used to lazily
   *  load a WASM encoder only when it's actually needed (issue #5's acceptance
   *  criterion: the MP3 WASM chunk must be absent from the initial page load), and/or
   *  to fail fast with a typed error when this browser can't encode the codec at all
   *  (issue #6: AAC/Opus have no WASM fallback, so an unsupported browser must be
   *  told clearly rather than attempting and failing deep inside Conversion.init). */
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
  aac: {
    createFormat: () => new Mp4OutputFormat(),
    audioCodec: 'aac',
    mimeType: 'audio/mp4',
    resolveBitrate: (settings) => kbpsStringToBps(aacBitrate(settings.quality)),
    ensureReady: () => ensureWebCodecsSupport('aac', 'AAC'),
  },
  opus: {
    createFormat: () => new OggOutputFormat(),
    audioCodec: 'opus',
    // Ogg Opus's registered MIME type, distinct from plain Ogg (matches the Mac app's
    // own convention of giving Opus a .opus extension rather than .ogg for the same
    // underlying Ogg container - see Codec.fileExtension).
    mimeType: 'audio/opus',
    resolveBitrate: (settings) => kbpsStringToBps(opusBitrate(settings.quality)),
    ensureReady: () => ensureWebCodecsSupport('opus', 'Opus'),
    // No explicit VBR toggle is reachable through Mediabunny's high-level Conversion
    // API (ConversionAudioOptions has no bitrateMode field), but the WebCodecs spec's
    // own default for AudioEncoderConfig.bitrateMode is 'variable' - Opus is VBR here
    // simply by not overriding that default, matching the issue's "-vbr on" ask.
  },
  flac: {
    createFormat: () => new FlacOutputFormat(),
    audioCodec: 'flac',
    mimeType: 'audio/flac',
    // No resolveBitrate: lossless, no bitrate concept, same as WAV. No compression
    // level either - see flac.ts's header comment for why that's a real, confirmed
    // gap rather than an oversight.
    ensureReady: ensureFlacEncoderRegistered,
  },
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
