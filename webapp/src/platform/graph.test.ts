import { describe, expect, it } from 'vitest'
import { CODEC_IDS } from '../engine/codec'
import {
  allEdges,
  allFormatNodes,
  edgesForCategory,
  edgeToSlug,
  formatNode,
  moduleForEdge,
  relatedConversions,
  slugToEdge,
} from './graph'

const ENCODABLE_TARGETS = ['mp3', 'aac', 'flac', 'wav', 'opus', 'aiff']
const NOT_YET_IMPLEMENTED = ['alac', 'wavpack', 'vorbis', 'wma']

describe('audio format nodes', () => {
  it('has one node per CodecId, all in the audio category', () => {
    const nodes = allFormatNodes()
    expect(nodes.map((n) => n.id).sort()).toEqual([...CODEC_IDS].sort())
    expect(nodes.every((n) => n.category === 'audio')).toBe(true)
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
    const edges = allEdges()
    expect(edges.length).toBeGreaterThan(0)
    for (const edge of edges) {
      expect(ENCODABLE_TARGETS).toContain(edge.to)
      expect(edge.from).not.toBe(edge.to)
      expect(edge.moduleId).toBe('audio')
    }
  })

  it('excludes not-yet-implemented codecs as conversion targets', () => {
    const edges = allEdges()
    for (const id of NOT_YET_IMPLEMENTED) {
      expect(edges.some((e) => e.to === id)).toBe(false)
    }
  })

  it('every CodecId can be a source, including not-yet-implemented ones', () => {
    const edges = allEdges()
    for (const id of CODEC_IDS) {
      expect(edges.some((e) => e.from === id)).toBe(true)
    }
  })

  it('edgesForCategory("audio") returns exactly all audio edges (the only category seeded so far)', () => {
    expect(edgesForCategory('audio')).toEqual(allEdges())
    expect(edgesForCategory('image')).toEqual([])
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
