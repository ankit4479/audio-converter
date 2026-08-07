import { beforeEach, describe, expect, it } from 'vitest'
import { audioModule } from '../modules/audio'
import { allEdges, edgeToSlug } from './graph'
import {
  liveCategories,
  sourceFormats,
  targetForEdge,
  targetsForSource,
} from './converterTargets'
import { register, _resetForTests } from './registry'

// These read the registry, so registration is part of the fixture rather than a
// side effect of importing a component - same pattern commandPaletteIndex.test.ts
// uses.
beforeEach(() => {
  _resetForTests()
  register(audioModule)
})

describe('liveCategories', () => {
  it('lists only categories that have both a registered module and real conversions', () => {
    expect(liveCategories()).toEqual(['audio'])
  })

  it('drops a category whose conversions exist but whose module was never registered', () => {
    _resetForTests()
    expect(liveCategories()).toEqual([])
  })
})

describe('sourceFormats', () => {
  it('lists every format with at least one outgoing conversion, once each', () => {
    const sources = sourceFormats()
    const ids = sources.map((source) => source.from)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('wav')
    expect(ids).toContain('mp3')
    expect(sources.every((source) => source.category === 'audio')).toBe(true)
  })

  it('carries each format the label the graph gives it, so pickers never show raw ids', () => {
    expect(sourceFormats().find((source) => source.from === 'mp3')?.label).toBe('MP3')
  })

  it('narrows to one category when asked, and returns nothing for a category with no conversions', () => {
    expect(sourceFormats('audio')).toEqual(sourceFormats())
    expect(sourceFormats('image')).toEqual([])
  })

  it('returns nothing at all when no module is registered, so no picker can offer a dead conversion', () => {
    _resetForTests()
    expect(sourceFormats()).toEqual([])
  })
})

describe('targetsForSource', () => {
  it('lists every conversion out of a format, with the href of that conversion’s own page', () => {
    const targets = targetsForSource('wav')
    const expected = allEdges().filter((edge) => edge.from === 'wav')
    expect(targets).toHaveLength(expected.length)
    for (const target of targets) {
      expect(target.href).toBe(`/${edgeToSlug('wav', target.to)}`)
      expect(target.moduleId).toBe('audio')
    }
  })

  it('never offers converting a format into itself', () => {
    expect(targetsForSource('mp3').map((target) => target.to)).not.toContain('mp3')
  })

  it('is empty for a format nothing converts out of', () => {
    expect(targetsForSource('not-a-format')).toEqual([])
  })
})

describe('targetForEdge', () => {
  it('finds the conversion behind a source/target pair', () => {
    expect(targetForEdge('wav', 'mp3')).toMatchObject({
      to: 'mp3',
      href: '/wav-to-mp3',
      moduleId: 'audio',
    })
  })

  it('returns undefined for a pair with no conversion, which is how the shell knows a format change cannot be a navigation', () => {
    // alac has no encoder, so it is a legitimate source label but never a target.
    expect(targetForEdge('wav', 'alac')).toBeUndefined()
    expect(targetForEdge('mp3', 'mp3')).toBeUndefined()
  })
})
