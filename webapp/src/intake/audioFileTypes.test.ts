import { describe, expect, it } from 'vitest'
import {
  AUDIO_EXTENSIONS,
  isAudioFileName,
  VIDEO_CONTAINER_EXTENSIONS,
} from './audioFileTypes'

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

describe('VIDEO_CONTAINER_EXTENSIONS (#38)', () => {
  it('is exactly the containers Mediabunny can demux: mp4/m4v, mov, mkv, webm', () => {
    expect([...VIDEO_CONTAINER_EXTENSIONS].sort()).toEqual(
      ['mp4', 'm4v', 'mov', 'mkv', 'webm'].sort(),
    )
  })

  it('does not include avi - no Mediabunny AVI demuxer exists', () => {
    expect(VIDEO_CONTAINER_EXTENSIONS.has('avi')).toBe(false)
  })
})

describe('isAudioFileName', () => {
  it.each([...AUDIO_EXTENSIONS])('accepts .%s', (ext) => {
    expect(isAudioFileName(`song.${ext}`)).toBe(true)
  })

  it.each([...VIDEO_CONTAINER_EXTENSIONS])(
    'accepts video container .%s, to extract its audio track (#38)',
    (ext) => {
      expect(isAudioFileName(`clip.${ext}`)).toBe(true)
    },
  )

  it('rejects .avi - explicitly unsupported, not silently promised', () => {
    expect(isAudioFileName('clip.avi')).toBe(false)
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
