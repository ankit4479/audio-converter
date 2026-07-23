/**
 * AIFF: big-endian 16-bit PCM in an IFF container. No Mediabunny OutputFormat exists
 * for it at all (its supported list is MP4/MOV/WebM/MKV/HLS/WAVE/MP3/Ogg/ADTS/FLAC/
 * MPEG-TS - confirmed by reading output-format.d.ts), so this is a hand-written
 * writer, not a codec wired into formats.ts's table. It reuses the already-correct
 * WAV path (issue #4) for decode/resample/channel handling - producing a little-
 * endian WAV first and transforming it into AIFF - rather than reimplementing
 * decode logic, then rewrites the header and byte-swaps the sample data.
 *
 * Known limitation (issue #8 is scoped to MP3->FLAC per its acceptance criteria, not
 * AIFF): the intermediate WAV can carry basic text tags (Mediabunny copies them by
 * default), but wavToAiff only ever reads 'fmt ' and 'data' chunks and silently drops
 * everything else, so text tags never reach the AIFF output. Cover art was never in
 * scope for AIFF either way - Codec.swift's supportsEmbeddedArt is false for it, same
 * as WAV. Fixing the text-tag gap would mean hand-writing AIFF's own idiosyncratic
 * metadata chunks (NAME/AUTH/ANNO), a second format-specific metadata writer for a
 * secondary/legacy format - flagged here rather than silently expanding this issue's
 * scope to build it.
 */
import { CODECS } from './codec'
import { ConversionError } from './convert'

// AIFF's classic chunk sizes are 32-bit. Some tools/specs treat them as signed,
// making 2^31 - 1 bytes the practical safe ceiling before ambiguity - the issue's
// own "files over 2GB" callout matches this, not the unsigned 4GB theoretical max.
const MAX_AIFF_BYTES = 2 ** 31 - 1

/** Pulled out of wavToAiff so the 2GB threshold is unit-testable without allocating
 *  an actual multi-gigabyte buffer - takes the already-computed total size. */
export function checkAiffSizeLimit(totalSize: number): void {
  if (totalSize > MAX_AIFF_BYTES) {
    throw new ConversionError(
      'unknown',
      `This file is too large for AIFF's 32-bit chunk sizes (${totalSize} bytes, limit ${MAX_AIFF_BYTES}).`,
    )
  }
}

/**
 * Writes `value` (assumed a small positive integer, e.g. a sample rate) as an
 * 80-bit IEEE extended-precision float, big-endian, into `view` at `offset` - the
 * format AIFF's COMM chunk requires and that no built-in JS API can produce (DataView
 * only has 32/64-bit float methods). Verified against independently hand-derived
 * reference bytes for 8000/44100/48000/96000 in aiff.test.ts, not just self-consistency.
 */
function writeIeee80BitFloat(view: DataView, offset: number, value: number): void {
  if (value === 0) return // all-zero bytes already represent 0 in this format
  const exponent = Math.floor(Math.log2(value))
  // Extended precision stores the leading bit explicitly (no implicit "1." like
  // 32/64-bit IEEE), so normalizing shifts the value up to fill all 64 mantissa bits.
  const mantissa = BigInt(Math.round(value / 2 ** (exponent - 63)))
  const biasedExponent = exponent + 16383
  view.setUint16(offset, biasedExponent, false)
  view.setBigUint64(offset + 2, mantissa, false)
}

interface ParsedWav {
  numberOfChannels: number
  sampleRate: number
  bitsPerSample: number
  pcmData: Uint8Array
}

/** Walks a WAV file's RIFF chunks to find 'fmt ' and 'data', ignoring any others
 *  (e.g. a 'LIST' metadata chunk) rather than assuming a fixed 44-byte header. */
function parseWav(bytes: Uint8Array): ParsedWav {
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

/** Builds a full AIFF file from a little-endian WAV's bytes. */
export function wavToAiff(wavBytes: Uint8Array): Uint8Array {
  const { numberOfChannels, sampleRate, bitsPerSample, pcmData } = parseWav(wavBytes)
  if (bitsPerSample !== 16) {
    throw new ConversionError(
      'unknown',
      `Unexpected bit depth for AIFF: ${bitsPerSample}.`,
    )
  }

  const bytesPerFrame = numberOfChannels * 2
  const numSampleFrames = Math.floor(pcmData.length / bytesPerFrame)
  const ssndDataSize = numSampleFrames * bytesPerFrame

  const commChunkSize = 18
  const ssndChunkSize = 8 + ssndDataSize
  const totalSize =
    4 /* 'AIFF' */ +
    8 +
    commChunkSize /* COMM header + body */ +
    8 +
    ssndChunkSize /* SSND header + body */

  checkAiffSizeLimit(totalSize)

  const out = new Uint8Array(8 + totalSize)
  const view = new DataView(out.buffer)
  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeAscii(0, 'FORM')
  view.setUint32(4, totalSize, false)
  writeAscii(8, 'AIFF')

  writeAscii(12, 'COMM')
  view.setUint32(16, commChunkSize, false)
  view.setUint16(20, numberOfChannels, false)
  view.setUint32(22, numSampleFrames, false)
  view.setUint16(26, 16, false) // bits per sample
  writeIeee80BitFloat(view, 28, sampleRate)

  const ssndOffset = 12 + 8 + commChunkSize
  writeAscii(ssndOffset, 'SSND')
  view.setUint32(ssndOffset + 4, ssndChunkSize, false)
  view.setUint32(ssndOffset + 8, 0, false) // offset
  view.setUint32(ssndOffset + 12, 0, false) // block size

  const sampleDataStart = ssndOffset + 16
  for (let i = 0; i < ssndDataSize; i += 2) {
    // 16-bit little-endian source -> big-endian AIFF, byte-swapped, not re-decoded.
    out[sampleDataStart + i] = pcmData[i + 1]
    out[sampleDataStart + i + 1] = pcmData[i]
  }

  return out
}

export function aiffFileName(baseName: string): string {
  return `${baseName}.${CODECS.aiff.fileExtension}`
}
