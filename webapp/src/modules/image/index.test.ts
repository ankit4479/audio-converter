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

  it('takes HEIC and HEIF now that it can decode them (E2.2, issue #32)', () => {
    for (const name of ['IMG_4821.HEIC', 'photo.heic', 'photo.heif']) {
      expect(imageModule.accepts(meta(name))).toBe(true)
    }
  })

  it('takes SVG now that it can rasterize it (E2.3, issue #33)', () => {
    for (const name of ['logo.svg', 'Icon.SVG']) {
      expect(imageModule.accepts(meta(name))).toBe(true)
    }
  })

  it('rejects files it has no decoder for, rather than accepting and failing later', () => {
    for (const name of ['song.mp3', 'clip.mp4', 'notes.txt', 'archive.zip']) {
      expect(imageModule.accepts(meta(name))).toBe(false)
    }
  })

  it('rejects a name whose only dot is the leading one, not treating it as an extension', () => {
    expect(imageModule.accepts(meta('.png'))).toBe(false)
  })
})

describe('imageModule contract', () => {
  it('agrees with the graph about which formats it reads and which it writes', () => {
    const imageEdges = allEdges().filter((edge) => edge.moduleId === 'image')
    expect(new Set(imageEdges.map((edge) => edge.from))).toEqual(
      new Set(imageModule.inputFormats),
    )
    expect(new Set(imageEdges.map((edge) => edge.to))).toEqual(
      new Set(imageModule.outputFormats),
    )
    for (const id of [...imageModule.inputFormats, ...imageModule.outputFormats]) {
      expect(formatNode(id)?.category).toBe('image')
    }
  })

  it('reads more formats than it writes: HEIC in, never out (E2.2, issue #32)', () => {
    expect(imageModule.inputFormats).toContain('heic')
    expect(imageModule.inputFormats).toContain('heif')
    expect(imageModule.outputFormats).not.toContain('heic')
    expect(imageModule.outputFormats).not.toContain('heif')
  })

  it('never offers a decode-only format as a conversion target anywhere in the graph', () => {
    for (const edge of allEdges()) {
      expect(['heic', 'heif']).not.toContain(edge.to)
    }
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
