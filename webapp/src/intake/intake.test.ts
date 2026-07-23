import { describe, expect, it } from 'vitest'
import { filterAndBuildAudioFiles } from './intake'
import type { ScannedFile } from './audioFile'

function scanned(name: string, relativePath = name): ScannedFile {
  return { file: new File(['x'], name), relativePath }
}

describe('filterAndBuildAudioFiles', () => {
  it('keeps audio files and builds AudioFiles from them', () => {
    const result = filterAndBuildAudioFiles([scanned('a.mp3'), scanned('b.flac')])
    expect(result.map((f) => f.displayName)).toEqual(['a.mp3', 'b.flac'])
  })

  it('silently skips non-audio files rather than erroring, matching FileIntake.scan', () => {
    const result = filterAndBuildAudioFiles([
      scanned('a.mp3'),
      scanned('cover.jpg'),
      scanned('.DS_Store'),
      scanned('notes.txt'),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].displayName).toBe('a.mp3')
  })

  it('preserves relativePath through the filter', () => {
    const result = filterAndBuildAudioFiles([scanned('a.mp3', 'Album/a.mp3')])
    expect(result[0].relativePath).toBe('Album/a.mp3')
  })
})
