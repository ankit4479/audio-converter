/**
 * Shared WAV-chunk reader for anything that needs raw PCM out of the intermediate WAV
 * `convertFile` already produces - AIFF (issue #7) reads it to byte-swap into its own
 * container, Vorbis (issue #37) reads it to feed a WASM encoder. Extracted out of
 * aiff.ts rather than duplicated, since both need the exact same RIFF-chunk walk.
 */
import { ConversionError } from './convert'

export interface ParsedWav {
  numberOfChannels: number
  sampleRate: number
  bitsPerSample: number
  pcmData: Uint8Array
}

/** Walks a WAV file's RIFF chunks to find 'fmt ' and 'data', ignoring any others
 *  (e.g. a 'LIST' metadata chunk) rather than assuming a fixed 44-byte header. */
export function parseWav(bytes: Uint8Array): ParsedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const readChunkId = (offset: number) =>
    String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    )

  if (readChunkId(0) !== 'RIFF' || readChunkId(8) !== 'WAVE') {
    throw new ConversionError('unknown', 'Intermediate WAV was malformed.')
  }

  let numberOfChannels: number | undefined
  let sampleRate: number | undefined
  let bitsPerSample: number | undefined
  let pcmData: Uint8Array | undefined

  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunkId = readChunkId(offset)
    const chunkSize = view.getUint32(offset + 4, true)
    const bodyStart = offset + 8

    if (chunkId === 'fmt ') {
      numberOfChannels = view.getUint16(bodyStart + 2, true)
      sampleRate = view.getUint32(bodyStart + 4, true)
      bitsPerSample = view.getUint16(bodyStart + 14, true)
    } else if (chunkId === 'data') {
      pcmData = bytes.subarray(bodyStart, bodyStart + chunkSize)
    }

    offset = bodyStart + chunkSize + (chunkSize % 2) // chunks are word-aligned
  }

  if (!numberOfChannels || !sampleRate || !bitsPerSample || !pcmData) {
    throw new ConversionError('unknown', 'Intermediate WAV was missing required chunks.')
  }
  return { numberOfChannels, sampleRate, bitsPerSample, pcmData }
}

/** Deinterleaves signed 16-bit little-endian PCM into one normalized (-1.0 to 1.0)
 *  Float32Array per channel - the format both WasmMediaEncoder's Vorbis encoder and
 *  the Web Audio API expect samples in. */
export function pcm16ToFloat32Planar(
  pcmData: Uint8Array,
  numberOfChannels: number,
): Float32Array[] {
  const view = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength)
  const bytesPerFrame = numberOfChannels * 2
  const frameCount = Math.floor(pcmData.length / bytesPerFrame)
  const channels = Array.from(
    { length: numberOfChannels },
    () => new Float32Array(frameCount),
  )
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = view.getInt16(frame * bytesPerFrame + channel * 2, true)
      channels[channel][frame] = sample / 32768
    }
  }
  return channels
}
