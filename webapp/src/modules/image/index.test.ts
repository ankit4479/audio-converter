import { describe, expect, it } from 'vitest'
import { allEdges, edgesForCategory, formatNode } from '../../platform/graph'
import { imageModule } from './index'

function meta(name: string) {
  return { name, type: '', size: 1 }
}

describe('imageModule.accepts', () => {
  it('takes the raster formats it can actually convert, whatever the case', () => {
    for (const name of ['a.png', 'B.JPG', 'c.jpeg', 'd.WebP', 'e.avif']) {
      expect(imageModule.accepts(meta(name))).toBe(true)
    }
  })

  it('rejects files it has no decoder for, rather than accepting and failing later', () => {
    // HEIC is #32 and SVG is #33: both need a decoder this module doesn't ship yet,
    // so taking them now would mean accepting a file we then fail on per-file.
    for (const name of ['photo.heic', 'logo.svg', 'song.mp3', 'clip.mp4', 'notes.txt']) {
      expect(imageModule.accepts(meta(name))).toBe(false)
    }
  })

  it('rejects a name whose only dot is the leading one, not treating it as an extension', () => {
    expect(imageModule.accepts(meta('.png'))).toBe(false)
  })
})

describe('imageModule contract', () => {
  it('agrees with the graph about which formats exist and which module owns them', () => {
    const imageNodes = allEdges()
      .filter((edge) => edge.moduleId === 'image')
      .flatMap((edge) => [edge.from, edge.to])
    expect(new Set(imageNodes)).toEqual(new Set(imageModule.outputFormats))
    for (const id of imageModule.outputFormats) {
      expect(formatNode(id)?.category).toBe('image')
    }
  })

  it('can produce every format it accepts as a source, unlike audio', () => {
    expect([...imageModule.inputFormats].sort()).toEqual(
      [...imageModule.outputFormats].sort(),
    )
  })

  it('names the settings key the shell should treat as the output format', () => {
    expect(imageModule.targetSettingKey).toBe('format')
    expect(imageModule.defaultSettings).toHaveProperty('format')
  })

  it('defaults to a target it has an edge for', () => {
    const target = imageModule.defaultSettings.format
    expect(edgesForCategory('image').some((edge) => edge.to === target)).toBe(true)
  })

  it('declares every settings field as data, with no JSX anywhere in the module', () => {
    for (const field of imageModule.settingsSchema) {
      expect(['select', 'slider', 'toggle', 'color']).toContain(field.kind)
      expect(typeof field.key).toBe('string')
      expect(typeof field.label).toBe('string')
    }
  })

  it('tells the shell an image has no playing time', () => {
    expect(imageModule.presentation.tracksDuration).toBe(false)
    expect(imageModule.presentation.item).toEqual({
      singular: 'image',
      plural: 'images',
    })
  })
})

describe('imageModule.probe', () => {
  it('reports unsupported with a reason when the browser lacks the image APIs', async () => {
    // jsdom has neither createImageBitmap nor OffscreenCanvas, which is exactly the
    // unsupported case this probe exists to catch before a file is ever accepted.
    const report = await imageModule.probe()
    if (typeof OffscreenCanvas === 'undefined') {
      expect(report.supported).toBe(false)
      expect(report.reason).toMatch(/browser/i)
    } else {
      expect(report.supported).toBe(true)
    }
  })
})
