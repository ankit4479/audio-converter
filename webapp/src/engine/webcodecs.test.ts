import { describe, expect, it } from 'vitest'
import { ConversionError } from './convert'
import { detectAudioEncoders, ensureWebCodecsSupport, kbpsStringToBps } from './webcodecs'

describe('kbpsStringToBps', () => {
  it("parses codec.ts's aacBitrate/opusBitrate strings into bits per second", () => {
    expect(kbpsStringToBps('256k')).toBe(256_000)
    expect(kbpsStringToBps('192k')).toBe(192_000)
    expect(kbpsStringToBps('128k')).toBe(128_000)
    expect(kbpsStringToBps('96k')).toBe(96_000)
  })
})

describe('ensureWebCodecsSupport', () => {
  // This test environment has no real AudioEncoder (WebCodecs isn't implemented in
  // jsdom), so canEncodeAudio always resolves false here - this is exactly the
  // "unsupported browser" path it's meant to guard, verified honestly rather than
  // mocked to pretend support exists.
  it('rejects with a typed, browser-attributable error when the codec is unsupported', async () => {
    const error = await ensureWebCodecsSupport('aac', 'AAC').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConversionError)
    expect((error as ConversionError).reason).toBe('unsupported-in-browser')
    expect((error as ConversionError).message).toContain('AAC')
  })
})

describe('detectAudioEncoders', () => {
  it('reports aac and opus availability, and is cached across calls', async () => {
    const first = await detectAudioEncoders()
    const second = await detectAudioEncoders()
    expect(first).toBe(second)
    expect(['available', 'unavailable']).toContain(first.aac)
    expect(['available', 'unavailable']).toContain(first.opus)
  })
})
