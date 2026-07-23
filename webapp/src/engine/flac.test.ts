import { canEncodeAudio } from 'mediabunny'
import { describe, expect, it } from 'vitest'
import { ensureFlacEncoderRegistered } from './flac'

describe('ensureFlacEncoderRegistered', () => {
  it('registers a FLAC encoder, and repeat calls are idempotent (same cached promise)', async () => {
    const first = ensureFlacEncoderRegistered()
    const second = ensureFlacEncoderRegistered()
    expect(second).toBe(first)
    await first
    expect(await canEncodeAudio('flac')).toBe(true)
  })
})
