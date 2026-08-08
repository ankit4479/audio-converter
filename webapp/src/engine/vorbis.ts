/**
 * Vorbis: no browser encodes it natively (no WebCodecs support anywhere), and unlike
 * MP3/FLAC, `wasm-media-encoders`'s Ogg Vorbis build cannot be wired in as a Mediabunny
 * `CustomAudioEncoder` - its `encode()`/`finalize()` already return fully Ogg-muxed
 * bytes (confirmed by reading `dist/es/index.d.mts` and the README's own usage example,
 * which builds the complete output file from concatenated `encode()` calls with no
 * separate muxing step), so handing them to Mediabunny's `OggOutputFormat` - which
 * expects raw elementary packets it will mux itself - would double-mux and produce a
 * broken file. This instead follows aiff.ts's shape: reuse the WAV path for decode and
 * resampling, then hand-build the target container from the resulting PCM.
 */
import { createOggEncoder } from 'wasm-media-encoders'
import { vorbisQualityScale, type QualityTier } from './codec'
import { ConversionError } from './convert'
import { parseWav, pcm16ToFloat32Planar } from './pcm'

// vorbisQualityScale (codec.ts:254-256) already computes this exact scale for a
// hypothetical native ffmpeg path - libvorbis's native VBR quality index is -1 (worst)
// to 10 (best), and wasm-media-encoders' `vbrQuality` option takes the same range, so
// this reuses it directly rather than keeping a second copy of the same mapping.
export function vorbisVbrQuality(quality: QualityTier): number {
  return Number(vorbisQualityScale(quality))
}

/** Builds a complete Ogg Vorbis file from a little-endian WAV's bytes. */
export async function wavToVorbis(
  wavBytes: Uint8Array,
  quality: QualityTier,
): Promise<Blob> {
  const { numberOfChannels, sampleRate, bitsPerSample, pcmData } = parseWav(wavBytes)
  if (bitsPerSample !== 16) {
    throw new ConversionError(
      'unknown',
      `Unexpected bit depth for Vorbis: ${bitsPerSample}.`,
    )
  }
  if (numberOfChannels !== 1 && numberOfChannels !== 2) {
    throw new ConversionError(
      'unknown',
      `Vorbis only supports mono or stereo, got ${numberOfChannels} channels.`,
    )
  }

  const channels = pcm16ToFloat32Planar(pcmData, numberOfChannels)

  let encoder
  try {
    encoder = await createOggEncoder()
  } catch (cause) {
    throw new ConversionError(
      'unsupported-in-browser',
      'This browser is missing the WebAssembly support this converter needs.',
      { cause },
    )
  }

  try {
    encoder.configure({
      channels: numberOfChannels,
      sampleRate,
      vbrQuality: vorbisVbrQuality(quality),
    })
    // Both Uint8Arrays are owned by the encoder and reused on the next call, per its
    // own docs, so `.slice()` copies them out immediately - this also gives Blob a
    // plain ArrayBuffer-backed view rather than the SharedArrayBuffer-compatible type
    // TypeScript's DOM lib requires it to reject.
    const body = encoder.encode(channels).slice()
    const tail = encoder.finalize().slice()
    return new Blob([body, tail], { type: 'audio/ogg' })
  } catch (cause) {
    if (cause instanceof ConversionError) throw cause
    throw new ConversionError('unknown', 'Vorbis encoding failed.', { cause })
  }
}
