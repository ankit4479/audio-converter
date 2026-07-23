import { describe, expect, it } from 'vitest'
import { checkAiffSizeLimit, wavToAiff } from './aiff'
import { ConversionError } from './convert'

/** Same header shape convertFile's WAV path produces. `extraChunk` optionally inserts
 *  a metadata-like chunk before 'data', proving the parser doesn't assume a fixed
 *  44-byte header. */
function makeWav(
  samples: number[],
  options: { numberOfChannels?: number; sampleRate?: number; extraChunk?: boolean } = {},
): Uint8Array {
  const numberOfChannels = options.numberOfChannels ?? 1
  const sampleRate = options.sampleRate ?? 44100
  const dataSize = samples.length * 2
  const extra = options.extraChunk
    ? new Uint8Array([0x4c, 0x49, 0x53, 0x54, 4, 0, 0, 0, 0, 0, 0, 0]) // 'LIST', size 4, 4 bytes body
    : new Uint8Array(0)

  const buf = new Uint8Array(44 + extra.length + dataSize)
  const view = new DataView(buf.buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + extra.length + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numberOfChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numberOfChannels * 2, true)
  view.setUint16(32, numberOfChannels * 2, true)
  view.setUint16(34, 16, true)
  buf.set(extra, 36)
  const dataChunkOffset = 36 + extra.length
  writeStr(dataChunkOffset, 'data')
  view.setUint32(dataChunkOffset + 4, dataSize, true)
  const sampleStart = dataChunkOffset + 8
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(sampleStart + i * 2, samples[i], true)
  }
  return buf
}

describe('wavToAiff', () => {
  it('writes the FORM/AIFF/COMM/SSND structure with correct channel count and bit depth', () => {
    const aiff = wavToAiff(
      makeWav([0, 1000, -1000, 32767, -32768], { numberOfChannels: 1 }),
    )
    const view = new DataView(aiff.buffer)
    const ascii = (offset: number, len: number) =>
      String.fromCharCode(...aiff.subarray(offset, offset + len))

    expect(ascii(0, 4)).toBe('FORM')
    expect(ascii(8, 4)).toBe('AIFF')
    expect(ascii(12, 4)).toBe('COMM')
    expect(view.getUint32(16, false)).toBe(18) // COMM body size
    expect(view.getUint16(20, false)).toBe(1) // numChannels
    expect(view.getUint32(22, false)).toBe(5) // numSampleFrames
    expect(view.getUint16(26, false)).toBe(16) // bits per sample
    expect(ascii(38, 4)).toBe('SSND')
  })

  it('is confirmed big-endian by inspecting the written sample bytes directly, not just by ear', () => {
    // 0x1234 little-endian is bytes [0x34, 0x12]; AIFF must store [0x12, 0x34].
    const samples = [0x1234, -1, 0x0001]
    const aiff = wavToAiff(makeWav(samples, { numberOfChannels: 1, sampleRate: 8000 }))
    const view = new DataView(aiff.buffer)

    // SSND header starts right after FORM(4)+AIFF(4)+COMM(8+18) = 38, SSND header is
    // 8 (id+size) + 8 (offset+blockSize) = 16 bytes, so sample data starts at 38+16.
    const sampleDataStart = 38 + 8 + 8
    expect(view.getInt16(sampleDataStart, false)).toBe(0x1234)
    expect(view.getInt16(sampleDataStart + 2, false)).toBe(-1)
    expect(view.getInt16(sampleDataStart + 4, false)).toBe(0x0001)
  })

  it('parses fmt/data chunks correctly even with an unrelated chunk (e.g. metadata) before data', () => {
    const withExtra = wavToAiff(makeWav([42, -42], { extraChunk: true }))
    const withoutExtra = wavToAiff(makeWav([42, -42], { extraChunk: false }))
    expect(withExtra).toEqual(withoutExtra)
  })

  it('preserves channel count and sample rate from the source', () => {
    const aiff = wavToAiff(
      makeWav([1, 2, 3, 4], { numberOfChannels: 2, sampleRate: 48000 }),
    )
    const view = new DataView(aiff.buffer)
    expect(view.getUint16(20, false)).toBe(2) // stereo
    expect(view.getUint32(22, false)).toBe(2) // 4 int16s / 2 channels = 2 frames
    // Sample rate as an 80-bit float, verified independently in the encoder test below.
    expect(view.getUint16(28, false)).toBe(0x400e)
    expect(view.getUint32(30, false)).toBe(0xbb800000)
  })

  it.each([
    [8000, '400bfa00000000000000'],
    [44100, '400eac44000000000000'],
    [48000, '400ebb80000000000000'],
    [96000, '400fbb80000000000000'],
  ])(
    'encodes %d Hz as the exact IEEE-80-bit-float bytes (independently derived, not self-consistency)',
    (sampleRate, expectedHex) => {
      const aiff = wavToAiff(makeWav([0, 0], { numberOfChannels: 1, sampleRate }))
      const actualHex = Array.from(aiff.subarray(28, 38))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
      expect(actualHex).toBe(expectedHex)
    },
  )
})

describe('checkAiffSizeLimit', () => {
  it('passes for sizes under the 2GB (2^31 - 1) ceiling', () => {
    expect(() => checkAiffSizeLimit(2 ** 31 - 1)).not.toThrow()
    expect(() => checkAiffSizeLimit(1000)).not.toThrow()
  })

  it('throws a typed, clear error rather than silently truncating for sizes at or over the ceiling', () => {
    expect(() => checkAiffSizeLimit(2 ** 31)).toThrow(ConversionError)
    try {
      checkAiffSizeLimit(2 ** 31)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ConversionError)
      expect((error as ConversionError).reason).toBe('unknown')
      expect((error as ConversionError).message).toMatch(/too large/i)
    }
  })
})
