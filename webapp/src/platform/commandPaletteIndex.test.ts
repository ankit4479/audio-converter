import { describe, expect, it } from 'vitest'
import '../modules/register'
import { allEdges, edgeToSlug } from './graph'
import { buildPaletteIndex } from './commandPaletteIndex'

describe('buildPaletteIndex', () => {
  it('has one entry per graph edge, all in the audio category', () => {
    const index = buildPaletteIndex()
    expect(index.length).toBe(allEdges().length)
    expect(index.every((entry) => entry.category === 'audio')).toBe(true)
  })

  it('labels an entry as "<from> to <to>" and links to its edge slug', () => {
    const entry = buildPaletteIndex().find((e) => e.slug === edgeToSlug('wav', 'mp3'))
    expect(entry?.label).toBe('WAV to MP3')
    expect(entry?.href).toBe('/wav-to-mp3')
  })

  it("keywords include both formats' ids, labels, and file extensions", () => {
    const entry = buildPaletteIndex().find((e) => e.slug === edgeToSlug('wav', 'mp3'))
    expect(entry?.keywords).toEqual(expect.arrayContaining(['wav', 'mp3', 'WAV', 'MP3']))
  })

  it('produces unique slugs across the whole index', () => {
    const slugs = buildPaletteIndex().map((entry) => entry.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
