import { describe, expect, it } from 'vitest'
import { toAudioFile } from './audioFile'
import { durationLabel, formatFileSize, totalSizeLabel } from './labels'

describe('formatFileSize', () => {
  it('formats bytes under 1000 with a "bytes" suffix, singular for exactly 1', () => {
    expect(formatFileSize(0)).toBe('0 bytes')
    expect(formatFileSize(1)).toBe('1 byte')
    expect(formatFileSize(500)).toBe('500 bytes')
  })

  it('formats KB with no decimal places', () => {
    expect(formatFileSize(1000)).toBe('1 KB')
    expect(formatFileSize(119_000)).toBe('119 KB')
  })

  it('formats MB and above with one decimal place', () => {
    expect(formatFileSize(1_200_000)).toBe('1.2 MB')
    expect(formatFileSize(42_100_000)).toBe('42.1 MB')
    expect(formatFileSize(3_500_000_000)).toBe('3.5 GB')
  })
})

describe('totalSizeLabel', () => {
  it('sums fileSize across all files and formats the total', () => {
    const files = [
      toAudioFile({ file: new File(['x'], 'a.mp3', {}), relativePath: 'a.mp3' }),
      toAudioFile({ file: new File(['x'], 'b.mp3', {}), relativePath: 'b.mp3' }),
    ]
    // Both files are 1 byte each in this fixture; just confirm it sums, not that it
    // matches a specific real-world size.
    expect(totalSizeLabel(files)).toBe(formatFileSize(2))
  })

  it('returns a zero-size label for an empty list', () => {
    expect(totalSizeLabel([])).toBe('0 bytes')
  })
})

describe('durationLabel', () => {
  it('matches AppState.durationLabel wording under an hour', () => {
    expect(durationLabel(125, false)).toBe('about 2m of music') // 2m05s -> 2m
    expect(durationLabel(60, false)).toBe('about 1m of music')
  })

  it('matches AppState.durationLabel wording at an hour or more', () => {
    expect(durationLabel(3600, false)).toBe('about 1h 0m of music')
    expect(durationLabel(3900, false)).toBe('about 1h 5m of music')
    expect(durationLabel(7325, false)).toBe('about 2h 2m of music')
  })

  it('shows "Calculating duration…" while scanning and duration is still 0', () => {
    expect(durationLabel(0, true)).toBe('Calculating duration…')
  })

  it('is empty when duration is 0 and not calculating (no files yet)', () => {
    expect(durationLabel(0, false)).toBe('')
  })
})
