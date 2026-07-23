import { describe, expect, it } from 'vitest'
import { CODEC_IDS } from './codec'
import { ENCODABLE_FORMATS, encodableFormatFor, outputFileName } from './formats'

describe('ENCODABLE_FORMATS', () => {
  it('WAV (#4) and MP3 (#5) are wired up - everything else is explicitly not-yet-implemented', () => {
    const implemented = CODEC_IDS.filter((id) => ENCODABLE_FORMATS[id] !== null)
    expect(implemented).toEqual(['mp3', 'wav'])
  })

  it('WAV has no bitrate concept; MP3 always resolves one', () => {
    expect(ENCODABLE_FORMATS.wav?.resolveBitrate).toBeUndefined()
    expect(ENCODABLE_FORMATS.mp3?.resolveBitrate).toBeTypeOf('function')
  })

  it('has an entry (implemented or null) for every codec, none missing', () => {
    expect(Object.keys(ENCODABLE_FORMATS).sort()).toEqual([...CODEC_IDS].sort())
  })

  it('encodableFormatFor mirrors the table directly', () => {
    for (const id of CODEC_IDS) {
      expect(encodableFormatFor(id)).toBe(ENCODABLE_FORMATS[id])
    }
  })
})

describe('outputFileName', () => {
  it("appends each codec's exact fileExtension from codec.ts, not a guess", () => {
    expect(outputFileName('song', 'mp3')).toBe('song.mp3')
    expect(outputFileName('song', 'aac')).toBe('song.m4a')
    expect(outputFileName('song', 'alac')).toBe('song.m4a')
    expect(outputFileName('song', 'flac')).toBe('song.flac')
    expect(outputFileName('song', 'wav')).toBe('song.wav')
    expect(outputFileName('song', 'opus')).toBe('song.opus')
    expect(outputFileName('song', 'aiff')).toBe('song.aiff')
    expect(outputFileName('song', 'wavpack')).toBe('song.wv')
    expect(outputFileName('song', 'vorbis')).toBe('song.ogg')
    expect(outputFileName('song', 'wma')).toBe('song.wma')
  })

  it('does not touch the base name, including any dots already in it', () => {
    expect(outputFileName('track.remastered.2024', 'flac')).toBe(
      'track.remastered.2024.flac',
    )
  })
})
