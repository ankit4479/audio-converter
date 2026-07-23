import { canEncodeAudio } from 'mediabunny'
import { describe, expect, it } from 'vitest'
import { ensureMp3EncoderRegistered, mp3BitrateForQuality } from './mp3'

describe('mp3BitrateForQuality', () => {
  it('maps to LAME V0/V2/V5 average bitrates in bps', () => {
    expect(mp3BitrateForQuality('best')).toBe(245_000)
    expect(mp3BitrateForQuality('good')).toBe(190_000)
    expect(mp3BitrateForQuality('small')).toBe(130_000)
  })
})

describe('ensureMp3EncoderRegistered', () => {
  it('registers an mp3 encoder, and repeat calls are idempotent (same cached promise)', async () => {
    expect(await canEncodeAudio('mp3')).toBe(false)
    const first = ensureMp3EncoderRegistered()
    const second = ensureMp3EncoderRegistered()
    expect(second).toBe(first)
    await first
    expect(await canEncodeAudio('mp3')).toBe(true)
  })
})
