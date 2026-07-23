import { describe, expect, it } from 'vitest'
import { CODEC_IDS } from './codec'
import { ENCODABLE_FORMATS, encodableFormatFor, outputFileName } from './formats'

describe('ENCODABLE_FORMATS', () => {
  it('WAV/MP3/AAC/Opus/FLAC are wired up - AIFF/ALAC/WavPack/Vorbis/WMA are explicitly not-yet-implemented', () => {
    const implemented = new Set(CODEC_IDS.filter((id) => ENCODABLE_FORMATS[id] !== null))
    expect(implemented).toEqual(new Set(['mp3', 'aac', 'flac', 'opus', 'wav']))
  })

  it('WAV and FLAC have no bitrate concept; MP3/AAC/Opus always resolve one', () => {
    expect(ENCODABLE_FORMATS.wav?.resolveBitrate).toBeUndefined()
    expect(ENCODABLE_FORMATS.flac?.resolveBitrate).toBeUndefined()
    expect(ENCODABLE_FORMATS.mp3?.resolveBitrate).toBeTypeOf('function')
    expect(ENCODABLE_FORMATS.aac?.resolveBitrate).toBeTypeOf('function')
    expect(ENCODABLE_FORMATS.opus?.resolveBitrate).toBeTypeOf('function')
  })

  it('AAC and Opus gate on browser support via ensureReady; FLAC and MP3 always register a WASM fallback', () => {
    for (const id of ['mp3', 'aac', 'opus', 'flac'] as const) {
      expect(ENCODABLE_FORMATS[id]?.ensureReady).toBeTypeOf('function')
    }
    expect(ENCODABLE_FORMATS.wav?.ensureReady).toBeUndefined()
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
