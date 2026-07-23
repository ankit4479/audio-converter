import { describe, expect, it } from 'vitest'
import { deduplicatePaths, resolvedOutputPath, resolveOutputPaths } from './outputPath'

describe('resolvedOutputPath (ConversionEngine.swift:179)', () => {
  it('swaps the extension for the target codec', () => {
    expect(resolvedOutputPath('song.mp3', 'flac')).toBe('song.flac')
  })

  it('preserves folder structure from a relative path', () => {
    expect(resolvedOutputPath('Album/track.wav', 'mp3')).toBe('Album/track.mp3')
  })

  it('handles a file with no extension', () => {
    expect(resolvedOutputPath('noext', 'wav')).toBe('noext.wav')
  })

  it('treats a dotfile with nothing after the dot as having no extension (NSString semantics)', () => {
    expect(resolvedOutputPath('.hidden', 'wav')).toBe('.hidden.wav')
  })

  it('still splits off a real extension on a dotfile that has one', () => {
    expect(resolvedOutputPath('.hidden.mp3', 'wav')).toBe('.hidden.wav')
  })

  it('treats a dotfile inside a folder the same way', () => {
    expect(resolvedOutputPath('Album/.hidden', 'wav')).toBe('Album/.hidden.wav')
  })
})

describe('deduplicatePaths (ConversionEngine.swift:188, deduplicated())', () => {
  it('leaves non-colliding paths untouched', () => {
    expect(deduplicatePaths(['a.mp3', 'b.mp3'])).toEqual(['a.mp3', 'b.mp3'])
  })

  it('renames the second and third collision onto " (2)", " (3)"', () => {
    expect(deduplicatePaths(['song.mp3', 'song.mp3', 'song.mp3'])).toEqual([
      'song.mp3',
      'song (2).mp3',
      'song (3).mp3',
    ])
  })

  it('keeps the folder prefix on a renamed collision', () => {
    expect(deduplicatePaths(['Album/song.mp3', 'Album/song.mp3'])).toEqual([
      'Album/song.mp3',
      'Album/song (2).mp3',
    ])
  })

  it('does not treat paths in different folders as colliding', () => {
    expect(deduplicatePaths(['A/song.mp3', 'B/song.mp3'])).toEqual([
      'A/song.mp3',
      'B/song.mp3',
    ])
  })

  it('renames a colliding path with no extension correctly', () => {
    expect(deduplicatePaths(['song', 'song'])).toEqual(['song', 'song (2)'])
  })

  it('renames a colliding dotfile onto the name, not before it', () => {
    expect(deduplicatePaths(['.hidden', '.hidden'])).toEqual(['.hidden', '.hidden (2)'])
  })
})

describe('resolveOutputPaths', () => {
  it('resolves extensions and deduplicates in one pass', () => {
    expect(resolveOutputPaths(['a/x.wav', 'b/x.mp3'], 'flac')).toEqual([
      'a/x.flac',
      'b/x.flac',
    ])
  })

  it('two source files that would collide produce name.ext and name (2).ext', () => {
    // Different source extensions in the same folder both resolve to the same
    // output extension, so they collide even though the sources didn't.
    expect(resolveOutputPaths(['track.wav', 'track.mp3'], 'flac')).toEqual([
      'track.flac',
      'track (2).flac',
    ])
  })
})
