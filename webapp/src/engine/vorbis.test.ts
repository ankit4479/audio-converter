import { describe, expect, it } from 'vitest'
import { ConversionError } from './convert'
import { vorbisVbrQuality, wavToVorbis } from './vorbis'

function makeWav(numSamples: number, sampleRate = 8000): Uint8Array {
  const dataSize = numSamples * 2
  const buf = new Uint8Array(44 + dataSize)
  const view = new DataView(buf.buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, Math.round(Math.sin(i / 10) * 10000), true)
  }
  return buf
}

describe('vorbisVbrQuality', () => {
  it('maps quality tiers onto libvorbis’s native -1..10 VBR scale, best to worst', () => {
    expect(vorbisVbrQuality('best')).toBe(8)
    expect(vorbisVbrQuality('good')).toBe(6)
    expect(vorbisVbrQuality('small')).toBe(4)
  })
})

describe('wavToVorbis', () => {
  it('produces real Ogg-container bytes, not a mock - starts with the OggS capture pattern', async () => {
    const blob = await wavToVorbis(makeWav(8000 * 2, 8000), 'best')
    expect(blob.type).toBe('audio/ogg')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('OggS')
  })

  it('a lower quality tier produces a smaller file for the same source', async () => {
    const source = makeWav(8000 * 3, 8000)
    const best = await wavToVorbis(source, 'best')
    const small = await wavToVorbis(source, 'small')
    expect(small.size).toBeLessThan(best.size)
  })

  it('rejects a bit depth other than 16 as an unknown-reason ConversionError', async () => {
    const wav24 = makeWav(100, 8000)
    wav24[34] = 24 // bitsPerSample field
    await expect(wavToVorbis(wav24, 'best')).rejects.toMatchObject({
      reason: 'unknown',
    })
    await expect(wavToVorbis(wav24, 'best')).rejects.toThrow(/bit depth/i)
  })

  it('wraps a malformed intermediate WAV as a ConversionError instead of a raw exception', async () => {
    await expect(wavToVorbis(new Uint8Array(10), 'best')).rejects.toBeInstanceOf(
      ConversionError,
    )
  })
})
