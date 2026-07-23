import { describe, expect, it } from 'vitest'
import { truncateMiddle } from './truncateMiddle'

describe('truncateMiddle', () => {
  it('returns text unchanged when it already fits', () => {
    expect(truncateMiddle('short.mp3', 20)).toBe('short.mp3')
  })

  it('truncates in the middle, not at the end, once text exceeds the limit', () => {
    const longLabel = 'Saving to: /Users/ankit/Music/Really Long Folder Name (FLAC)'
    const result = truncateMiddle(longLabel, 20)
    expect(result).toHaveLength(20)
    expect(result).toContain('…')
    // The end of the original string must survive - a middle truncation, not an
    // end truncation, keeps the tail (which is exactly what an end-ellipsis loses).
    expect(result.endsWith('(FLAC)')).toBe(true)
    expect(result.startsWith('Saving to:')).toBe(true)
  })

  it('keeps the head and the true tail (not a mid-string slice) for a small budget', () => {
    expect(truncateMiddle('abcdefghij', 5)).toBe('ab…ij')
  })
})
