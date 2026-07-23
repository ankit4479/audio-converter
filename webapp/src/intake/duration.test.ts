import { describe, expect, it } from 'vitest'
import { toAudioFile } from './audioFile'
import { totalDuration } from './duration'

function makeWavFile(name: string, seconds: number, sampleRate = 44100): File {
  const numSamples = Math.round(seconds * sampleRate)
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
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  return new File([buf], name, { type: 'audio/wav' })
}

describe('totalDuration', () => {
  it('sums duration across multiple real files', async () => {
    const files = [
      toAudioFile({ file: makeWavFile('a.wav', 1), relativePath: 'a.wav' }),
      toAudioFile({ file: makeWavFile('b.wav', 2), relativePath: 'b.wav' }),
      toAudioFile({ file: makeWavFile('c.wav', 1.5), relativePath: 'c.wav' }),
    ]
    expect(await totalDuration(files)).toBeCloseTo(4.5, 1)
  })

  it('a file that fails to parse contributes 0 rather than throwing or breaking the batch', async () => {
    const files = [
      toAudioFile({ file: makeWavFile('good.wav', 2), relativePath: 'good.wav' }),
      toAudioFile({
        file: new File([new Uint8Array(50).fill(0xff)], 'garbage.mp3'),
        relativePath: 'garbage.mp3',
      }),
    ]
    await expect(totalDuration(files)).resolves.toBeCloseTo(2, 1)
  })

  it('handles more files than the concurrency limit correctly', async () => {
    const files = Array.from({ length: 20 }, (_, i) =>
      toAudioFile({ file: makeWavFile(`f${i}.wav`, 1), relativePath: `f${i}.wav` }),
    )
    expect(await totalDuration(files)).toBeCloseTo(20, 0)
  })

  it('returns 0 for an empty list', async () => {
    expect(await totalDuration([])).toBe(0)
  })
})
