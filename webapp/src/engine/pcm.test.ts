import { describe, expect, it } from 'vitest'
import { ConversionError } from './convert'
import { parseWav, pcm16ToFloat32Planar } from './pcm'

function wav(fmtBody: number[], dataBytes: number[]): Uint8Array {
  const chunks = [
    ...[...'RIFF'].map((c) => c.charCodeAt(0)),
    0,
    0,
    0,
    0, // RIFF size, unchecked by parseWav
    ...[...'WAVE'].map((c) => c.charCodeAt(0)),
    ...[...'fmt '].map((c) => c.charCodeAt(0)),
    fmtBody.length,
    0,
    0,
    0,
    ...fmtBody,
    ...[...'data'].map((c) => c.charCodeAt(0)),
    dataBytes.length,
    0,
    0,
    0,
    ...dataBytes,
  ]
  return new Uint8Array(chunks)
}

// A minimal valid 'fmt ' body: PCM, 1 channel, 8000Hz, 16-bit.
const MONO_16BIT_8KHZ_FMT = [1, 0, 1, 0, 0x40, 0x1f, 0, 0, 0, 0, 0, 0, 2, 0, 16, 0]

describe('parseWav', () => {
  it('reads channel count, sample rate, bit depth, and PCM data', () => {
    const parsed = parseWav(wav(MONO_16BIT_8KHZ_FMT, [0x34, 0x12, 0xcd, 0xab]))
    expect(parsed.numberOfChannels).toBe(1)
    expect(parsed.sampleRate).toBe(8000)
    expect(parsed.bitsPerSample).toBe(16)
    expect(parsed.pcmData).toEqual(new Uint8Array([0x34, 0x12, 0xcd, 0xab]))
  })

  it('skips an unrelated chunk (e.g. LIST) rather than assuming a fixed header size', () => {
    const listChunk = [...[...'LIST'].map((c) => c.charCodeAt(0)), 2, 0, 0, 0, 0xaa, 0xbb]
    const base = wav(MONO_16BIT_8KHZ_FMT, [0x01, 0x02])
    // Splice the LIST chunk in right after 'WAVE' (offset 12), before 'fmt '.
    const withList = new Uint8Array([
      ...base.slice(0, 12),
      ...listChunk,
      ...base.slice(12),
    ])
    const parsed = parseWav(withList)
    expect(parsed.pcmData).toEqual(new Uint8Array([0x01, 0x02]))
  })

  it('rejects bytes with no RIFF/WAVE header', () => {
    expect(() => parseWav(new Uint8Array(20))).toThrow(ConversionError)
  })

  it('rejects a RIFF/WAVE file missing fmt or data', () => {
    const noData = new Uint8Array([
      ...[...'RIFF'].map((c) => c.charCodeAt(0)),
      0,
      0,
      0,
      0,
      ...[...'WAVE'].map((c) => c.charCodeAt(0)),
    ])
    expect(() => parseWav(noData)).toThrow(ConversionError)
  })
})

describe('pcm16ToFloat32Planar', () => {
  it('deinterleaves mono 16-bit PCM into one normalized channel', () => {
    // 32767 -> just under 1.0, -32768 -> exactly -1.0, 0 -> 0.
    const pcm = new Uint8Array(new Int16Array([32767, -32768, 0]).buffer)
    const [channel] = pcm16ToFloat32Planar(pcm, 1)
    expect(channel[0]).toBeCloseTo(32767 / 32768, 5)
    expect(channel[1]).toBe(-1)
    expect(channel[2]).toBe(0)
  })

  it('deinterleaves stereo PCM into separate left/right channels, not alternating samples', () => {
    // L=100, R=200, L=300, R=400
    const pcm = new Uint8Array(new Int16Array([100, 200, 300, 400]).buffer)
    const [left, right] = pcm16ToFloat32Planar(pcm, 2)
    expect(Array.from(left)).toEqual([100 / 32768, 300 / 32768])
    expect(Array.from(right)).toEqual([200 / 32768, 400 / 32768])
  })
})
