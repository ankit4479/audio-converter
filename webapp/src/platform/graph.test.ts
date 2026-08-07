import { describe, expect, it } from 'vitest'
import { CODEC_IDS } from '../engine/codec'
import {
  allEdges,
  allFormatNodes,
  categoriesWithConversions,
  edgesForCategory,
  edgeToSlug,
  formatNode,
  moduleForEdge,
  outputExtension,
  relatedConversions,
  slugToEdge,
} from './graph'

const ENCODABLE_TARGETS = ['mp3', 'aac', 'flac', 'wav', 'opus', 'aiff']
const NOT_YET_IMPLEMENTED = ['alac', 'wavpack', 'vorbis', 'wma']

describe('audio format nodes', () => {
  it('has one node per CodecId', () => {
    const audioNodes = allFormatNodes().filter((n) => n.category === 'audio')
    expect(audioNodes.map((n) => n.id).sort()).toEqual([...CODEC_IDS].sort())
  })

  it('every node exposes a label and its file extension', () => {
    const wav = formatNode('wav')
    expect(wav?.label).toBe('WAV')
    expect(wav?.extensions).toEqual(['wav'])
  })

  it('mime is present for encodable targets, undefined for not-yet-implemented codecs', () => {
    expect(formatNode('mp3')?.mime).toBe('audio/mpeg')
    expect(formatNode('aiff')?.mime).toBe('audio/aiff')
    for (const id of NOT_YET_IMPLEMENTED) {
      expect(formatNode(id)?.mime).toBeUndefined()
    }
  })
})

describe('audio edges', () => {
  it('only includes today’s working output targets, never a format to itself', () => {
    const edges = edgesForCategory('audio')
    expect(edges.length).toBeGreaterThan(0)
    for (const edge of edges) {
      expect(ENCODABLE_TARGETS).toContain(edge.to)
      expect(edge.from).not.toBe(edge.to)
      expect(edge.moduleId).toBe('audio')
    }
  })

  it('excludes not-yet-implemented codecs as conversion targets', () => {
    const edges = edgesForCategory('audio')
    for (const id of NOT_YET_IMPLEMENTED) {
      expect(edges.some((e) => e.to === id)).toBe(false)
    }
  })

  it('every CodecId can be a source, including not-yet-implemented ones', () => {
    const edges = edgesForCategory('audio')
    for (const id of CODEC_IDS) {
      expect(edges.some((e) => e.from === id)).toBe(true)
    }
  })

  it('edgesForCategory("audio") returns every audio edge and nothing from another category', () => {
    const audioEdges = edgesForCategory('audio')
    expect(audioEdges.length).toBeGreaterThan(0)
    expect(audioEdges).toEqual(allEdges().filter((edge) => edge.moduleId === 'audio'))
    // Was `toEqual([])` until E2.1 (issue #31) gave image real edges.
    expect(edgesForCategory('video')).toEqual([])
  })
})

describe('moduleForEdge', () => {
  it('resolves the owning module for a real edge', () => {
    expect(moduleForEdge('wav', 'mp3')).toBe('audio')
  })

  it('is undefined for an edge that does not exist', () => {
    expect(moduleForEdge('mp3', 'mp3')).toBeUndefined()
    expect(moduleForEdge('mp3', 'wavpack')).toBeUndefined()
    expect(moduleForEdge('nonsense', 'mp3')).toBeUndefined()
  })
})

describe('relatedConversions', () => {
  it('includes formats reachable as either the source or the target', () => {
    const related = relatedConversions('wav')
    // wav -> mp3 (wav is a source) and mp3 -> wav (wav is a target) both count.
    expect(related).toContain('mp3')
    expect(related).not.toContain('wav')
  })

  it('is empty for a format with no edges at all', () => {
    expect(relatedConversions('does-not-exist')).toEqual([])
  })
})

describe('slug round-trip', () => {
  it('edgeToSlug and slugToEdge invert each other for a real edge', () => {
    const slug = edgeToSlug('wav', 'mp3')
    expect(slug).toBe('wav-to-mp3')
    expect(slugToEdge(slug)).toEqual({ from: 'wav', to: 'mp3', moduleId: 'audio' })
  })

  it('slugToEdge rejects malformed or non-existent slugs', () => {
    expect(slugToEdge('not-a-real-slug')).toBeUndefined()
    expect(slugToEdge('mp3-to-mp3')).toBeUndefined()
    expect(slugToEdge('made-up-to-nonsense')).toBeUndefined()
  })
})

// E2.1 (issue #31): the graph stopped being audio-only.
describe('image format nodes and edges', () => {
  const IMAGE_FORMATS = ['png', 'jpg', 'webp', 'avif']

  it('has a node per image format, each with a MIME type and an extension', () => {
    for (const id of IMAGE_FORMATS) {
      const node = formatNode(id)
      expect(node?.category).toBe('image')
      expect(node?.mime).toMatch(/^image\//)
      expect(node?.extensions.length).toBeGreaterThan(0)
    }
  })

  it('names JPEG once but accepts both of its extensions, canonical one first', () => {
    expect(formatNode('jpg')?.label).toBe('JPEG')
    expect(formatNode('jpg')?.extensions).toEqual(['jpg', 'jpeg'])
    expect(outputExtension('jpg')).toBe('jpg')
  })

  it('connects every image format to every other, in both directions, never to itself', () => {
    const edges = edgesForCategory('image')
    expect(edges).toHaveLength(IMAGE_FORMATS.length * (IMAGE_FORMATS.length - 1))
    for (const edge of edges) {
      expect(edge.from).not.toBe(edge.to)
      expect(edge.moduleId).toBe('image')
    }
    expect(moduleForEdge('png', 'webp')).toBe('image')
    expect(moduleForEdge('heic', 'jpg')).toBeUndefined() // #32 adds this
  })

  it('never crosses categories, so no page claims to turn an MP3 into a PNG', () => {
    for (const edge of allEdges()) {
      expect(formatNode(edge.from)?.category).toBe(formatNode(edge.to)?.category)
    }
  })

  it('counts image as a live category now that it has edges', () => {
    expect(categoriesWithConversions()).toEqual(
      expect.arrayContaining(['audio', 'image']),
    )
  })
})

describe('outputExtension', () => {
  it('gives the canonical extension a converted file should be named with', () => {
    expect(outputExtension('mp3')).toBe('mp3')
    expect(outputExtension('webp')).toBe('webp')
  })

  it('is undefined for a format the graph does not know', () => {
    expect(outputExtension('not-a-format')).toBeUndefined()
  })
})
