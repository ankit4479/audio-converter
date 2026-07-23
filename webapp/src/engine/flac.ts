/**
 * FLAC: native WebCodecs where a browser has it, @mediabunny/flac-encoder's WASM
 * (libFLAC) build otherwise - the issue's own required fallback, since dropping the
 * format entirely on unsupported browsers isn't acceptable for a lossless option.
 *
 * No compression-level control either way: read @mediabunny/flac-encoder's actual
 * worker protocol (dist/modules/src/encoder.js) rather than assuming - its 'init'
 * command only carries numberOfChannels, sampleRate, and bitsPerSample, nothing
 * resembling Codec.swift's -compression_level. Mediabunny's own ConversionAudioOptions
 * has no compression-level field either. Codec.swift's balanced/fast/smallest tiers
 * (compressionTierLevel in codec.ts) have no reachable browser equivalent through
 * either the native or WASM path - flagged honestly in this issue's evidence rather
 * than silently ignored or faked.
 */
import { canEncodeAudio } from 'mediabunny'

let registerPromise: Promise<void> | null = null

export function ensureFlacEncoderRegistered(): Promise<void> {
  registerPromise ??= (async () => {
    if (await canEncodeAudio('flac')) return
    const { registerFlacEncoder } = await import('@mediabunny/flac-encoder')
    registerFlacEncoder()
  })()
  return registerPromise
}
