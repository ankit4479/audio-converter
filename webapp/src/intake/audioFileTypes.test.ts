import { describe, expect, it } from 'vitest'
import { AUDIO_EXTENSIONS, isAudioFileName } from './audioFileTypes'

describe('AUDIO_EXTENSIONS', () => {
  it('matches AudioFileTypes.extensions from the Swift source exactly', () => {
    expect([...AUDIO_EXTENSIONS].sort()).toEqual(
      [
        'mp3',
        'm4a',
        'aac',
        'flac',
        'wav',
        'aiff',
        'aif',
        'opus',
        'ogg',
        'oga',
        'wma',
        'wv',
        'ape',
        'caf',
        'alac',
      ].sort(),
    )
  })
})

describe('isAudioFileName', () => {
  it.each([...AUDIO_EXTENSIONS])('accepts .%s', (ext) => {
    expect(isAudioFileName(`song.${ext}`)).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isAudioFileName('SONG.MP3')).toBe(true)
    expect(isAudioFileName('Song.Flac')).toBe(true)
  })

  it('rejects non-audio extensions', () => {
    expect(isAudioFileName('photo.jpg')).toBe(false)
    expect(isAudioFileName('document.pdf')).toBe(false)
    expect(isAudioFileName('.DS_Store')).toBe(false)
  })

  it('rejects files with no extension', () => {
    expect(isAudioFileName('README')).toBe(false)
  })

  it('handles filenames with multiple dots by using the last extension', () => {
    expect(isAudioFileName('track.remastered.2024.flac')).toBe(true)
    expect(isAudioFileName('track.flac.txt')).toBe(false)
  })
})
