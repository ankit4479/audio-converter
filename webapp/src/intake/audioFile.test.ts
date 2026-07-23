import { describe, expect, it } from 'vitest'
import { deduplicateAgainst, toAudioFile, type ScannedFile } from './audioFile'

function scanned(name: string, relativePath: string, size = 100): ScannedFile {
  return { file: new File([new Uint8Array(size)], name), relativePath }
}

describe('toAudioFile', () => {
  it('carries file, relativePath, fileSize, and displayName through', () => {
    const s = scanned('song.mp3', 'Album/song.mp3', 4096)
    const audioFile = toAudioFile(s)
    expect(audioFile.file).toBe(s.file)
    expect(audioFile.relativePath).toBe('Album/song.mp3')
    expect(audioFile.fileSize).toBe(4096)
    expect(audioFile.displayName).toBe('song.mp3')
  })

  it('assigns a unique id to every file, even with identical names', () => {
    const a = toAudioFile(scanned('song.mp3', 'song.mp3'))
    const b = toAudioFile(scanned('song.mp3', 'song.mp3'))
    expect(a.id).not.toBe(b.id)
  })
})

describe('deduplicateAgainst', () => {
  it('drops incoming files whose relativePath already exists', () => {
    const existing = [toAudioFile(scanned('a.mp3', 'Album/a.mp3'))]
    const incoming = [
      toAudioFile(scanned('a.mp3', 'Album/a.mp3')), // duplicate
      toAudioFile(scanned('b.mp3', 'Album/b.mp3')), // new
    ]
    const result = deduplicateAgainst(existing, incoming)
    expect(result.map((f) => f.relativePath)).toEqual(['Album/b.mp3'])
  })

  it('drops duplicates within the incoming batch itself, not just against existing', () => {
    const incoming = [
      toAudioFile(scanned('a.mp3', 'Album/a.mp3')),
      toAudioFile(scanned('a.mp3', 'Album/a.mp3')), // same folder dropped twice in one batch
    ]
    const result = deduplicateAgainst([], incoming)
    expect(result).toHaveLength(1)
  })

  it('returns everything when nothing overlaps', () => {
    const incoming = [
      toAudioFile(scanned('a.mp3', 'a.mp3')),
      toAudioFile(scanned('b.mp3', 'b.mp3')),
    ]
    expect(deduplicateAgainst([], incoming)).toHaveLength(2)
  })
})
