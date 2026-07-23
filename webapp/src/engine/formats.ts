/**
 * Maps our CodecId (codec.ts) to the Mediabunny OutputFormat + AudioCodec pair that
 * produces it, plus the correct file extension and MIME type for the *audio* file we
 * actually want — Mediabunny's own `OutputFormat.fileExtension`/`mimeType` getters are
 * generic/video-oriented (Mp4OutputFormat reports '.mp4' and 'video/mp4', since MP4 is
 * usually video), which would be wrong for an audio-only .m4a. CODECS' own
 * fileExtension (codec.ts, ported from Codec.swift) is the source of truth for the
 * saved filename instead.
 *
 * Only WAV is wired up here — issue #4's job is the engine skeleton, proven end to end
 * with the one format that needs no quality/bitrate resolution at all. The rest are
 * `null` ("not implemented yet") deliberately, even though Mediabunny can technically
 * mux most of them, because resolving codec.ts's quality tiers into Mediabunny's actual
 * config shape isn't a trivial 1:1 mapping and belongs to its own reviewed issue:
 *  - MP3 (#5): Mediabunny's bundled LAME extension takes a flat CBR `bitrate` in its
 *    worker protocol, not LAME's `-q:a` VBR quality presets that mp3QualityScale()
 *    ports from Codec.swift. Whether the WASM build exposes a VBR mode at all needs
 *    checking before deciding how best/good/small should map.
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
import { WavOutputFormat } from 'mediabunny'
import type { AudioCodec } from 'mediabunny'
import { CODECS, type CodecId } from './codec'

export interface EncodableFormat {
  /** Builds a fresh OutputFormat instance. A factory, not a shared instance, since
   *  Output takes ownership of the format instance it's constructed with. */
  createFormat: () => InstanceType<typeof WavOutputFormat>
  audioCodec: AudioCodec
  mimeType: string
}

export const ENCODABLE_FORMATS: Readonly<Record<CodecId, EncodableFormat | null>> = {
  wav: {
    createFormat: () => new WavOutputFormat(),
    // Codec.swift uses pcm_s16le; Mediabunny's little-endian 16-bit PCM id is 'pcm-s16'.
    audioCodec: 'pcm-s16',
    mimeType: 'audio/wav',
  },
  mp3: null,
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
