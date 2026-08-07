import { describe, expect, it, vi } from 'vitest'
import { isSvg, rasterizeSvg } from './svg'

/**
 * jsdom has DOMParser and XMLSerializer for real, so the parsing and sizing logic is
 * exercised genuinely. Only the two things jsdom lacks are stubbed: image loading and
 * createImageBitmap. What each test asserts is the markup handed to the browser, which
 * is what decides whether the render is crisp - the actual rasterization is the
 * browser's job and is checked in the browser walkthrough instead.
 */
/** Stubs the two things jsdom lacks: image loading and createImageBitmap. */
function stubImage(onLoad: (image: Record<string, unknown>) => void = () => {}) {
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = 0
    naturalHeight = 0
    #src = ''
    set src(value: string) {
      this.#src = value
      onLoad(this as unknown as Record<string, unknown>)
      queueMicrotask(() => this.onload?.())
    }
    get src() {
      return this.#src
    }
  }
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1, height: 1 })),
  )
}

/** The markup actually handed to the renderer, recovered from the Blob passed to
 *  createObjectURL. */
function captureMarkup() {
  const markup: string[] = []
  const original = URL.createObjectURL
  const revoked: string[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
    if (blob instanceof Blob) {
      // Blob.text() is async; the size attributes are what matter and they are already
      // in the blob, so read them on the next tick and assert after the await.
      void blob.text().then((text) => markup.push(text))
    }
    return 'blob:fake'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
    revoked.push(url)
  })
  return { markup, revoked, restore: () => (URL.createObjectURL = original) }
}

const SQUARE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50"/></svg>'

describe('isSvg', () => {
  it('recognises SVG from its content, not its name or MIME type', async () => {
    expect(await isSvg(new Blob([SQUARE]))).toBe(true)
    expect(
      await isSvg(new Blob(['<?xml version="1.0"?>\n<!-- a comment -->\n' + SQUARE])),
    ).toBe(true)
  })

  it('rejects a file that merely mentions svg somewhere', async () => {
    expect(await isSvg(new Blob(['this text talks about svg files']))).toBe(false)
    expect(await isSvg(new Blob(['<html><body>svgish</body></html>']))).toBe(false)
  })

  it('recognises a namespaced root, which some editors write', async () => {
    const prefixed =
      '<svg:svg xmlns:svg="http://www.w3.org/2000/svg" width="10" height="10"/>'
    expect(await isSvg(new Blob([prefixed]))).toBe(true)
  })

  it('looks past a long doctype, as an Illustrator export has', async () => {
    const preamble = `<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd" [\n${'<!ENTITY ns_padding "a-very-long-entity-declaration-of-the-kind-illustrator-writes">\n'.repeat(20)}]>\n`
    expect(preamble.length).toBeGreaterThan(1024)
    expect(await isSvg(new Blob([preamble + SQUARE]))).toBe(true)
  })

  it('rejects binary image data', async () => {
    expect(await isSvg(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]))).toBe(false)
  })
})

describe('rasterizeSvg sizing', () => {
  it('renders at the SVG’s own size at 1x', async () => {
    const captured = captureMarkup()
    stubImage()
    const result = await rasterizeSvg(new Blob([SQUARE]), 1)
    expect(result).toMatchObject({ width: 100, height: 50 })
    expect(captured.markup[0]).toContain('width="100"')
    expect(captured.markup[0]).toContain('height="50"')
    captured.restore()
  })

  it('writes the scaled size into the markup, so the browser rasterizes the vector at that size', async () => {
    const captured = captureMarkup()
    stubImage()
    const result = await rasterizeSvg(new Blob([SQUARE]), 3)
    expect(result).toMatchObject({ width: 300, height: 150 })
    // The point of the whole approach: the size is in the markup the renderer sees,
    // not applied afterwards to an already-rasterized image.
    expect(captured.markup[0]).toContain('width="300"')
    expect(captured.markup[0]).toContain('height="150"')
    captured.restore()
  })

  it('falls back to the viewBox for an SVG with no width or height, as exported icons often are', async () => {
    const captured = captureMarkup()
    stubImage()
    const viewBoxOnly =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><rect width="24" height="16"/></svg>'
    const result = await rasterizeSvg(new Blob([viewBoxOnly]), 2)
    expect(result).toMatchObject({ width: 48, height: 32 })
    captured.restore()
  })

  it('completes a missing dimension from the viewBox’s aspect ratio', async () => {
    const captured = captureMarkup()
    stubImage()
    const widthOnly =
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" viewBox="0 0 20 10"><rect width="20" height="10"/></svg>'
    const result = await rasterizeSvg(new Blob([widthOnly]), 1)
    expect(result).toMatchObject({ width: 200, height: 100 })
    captured.restore()
  })

  it('ignores a percentage size, which means nothing without a container', async () => {
    const captured = captureMarkup()
    stubImage()
    const percent =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 40 20"><rect/></svg>'
    const result = await rasterizeSvg(new Blob([percent]), 1)
    expect(result).toMatchObject({ width: 40, height: 20 })
    captured.restore()
  })

  it('falls back to a default for an SVG with neither a size nor a viewBox', async () => {
    const captured = captureMarkup()
    stubImage()
    const bare =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
    const result = await rasterizeSvg(new Blob([bare]), 1)
    expect(result).toMatchObject({ width: 512, height: 512 })
    captured.restore()
  })

  it('brings an oversized render inside what a canvas can draw, keeping the aspect ratio', async () => {
    const captured = captureMarkup()
    stubImage()
    const huge =
      '<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="4000"><rect/></svg>'
    const result = await rasterizeSvg(new Blob([huge]), 4)

    // 8000x4000 at 4x asks for 32000x16000: past the per-side limit, and 512M pixels,
    // which is ~30x the area iOS Safari will draw. A canvas that big fails by clipping
    // rather than throwing, so the render is scaled to fit instead of coming out blank.
    expect(result.width * result.height).toBeLessThanOrEqual(16_777_216)
    expect(result.width).toBeLessThanOrEqual(16384)
    // Both sides come down by the same factor: capping only the side that overflowed
    // would have turned this 2:1 drawing into a near-square.
    // 2 decimal places, not more: the sides are rounded to whole pixels, which shifts
    // the ratio very slightly at these sizes (5793/2896 = 2.0003).
    expect(result.width / result.height).toBeCloseTo(2, 2)
    captured.restore()
  })

  it('says on the file’s row when the render had to be made smaller than asked for', async () => {
    const captured = captureMarkup()
    stubImage()
    const huge =
      '<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="4000"><rect/></svg>'
    const result = await rasterizeSvg(new Blob([huge]), 4)
    // Getting a smaller image than requested is exactly the kind of thing that must not
    // happen quietly.
    expect(result.note).toMatch(/Rendered at \d+x\d+/)
    captured.restore()
  })

  it('says nothing when the requested size was honored exactly', async () => {
    const captured = captureMarkup()
    stubImage()
    const result = await rasterizeSvg(new Blob([SQUARE]), 2)
    expect(result).toMatchObject({ width: 200, height: 100 })
    expect(result.note).toBeUndefined()
    captured.restore()
  })

  it('supplies the viewBox a viewBox-less SVG needs, so the size is a scale and not padding', async () => {
    const captured = captureMarkup()
    stubImage()
    // Without a viewBox the pixel size only sizes the viewport - user units still map
    // 1:1 - so a 2x request would return a 200x100 image with the artwork still 100x50
    // in the corner.
    const result = await rasterizeSvg(new Blob([SQUARE]), 2)
    expect(result).toMatchObject({ width: 200, height: 100 })
    expect(captured.markup[0]).toContain('viewBox="0 0 100 50"')
    captured.restore()
  })

  it('leaves an existing viewBox alone - it is the drawing’s own coordinate system', async () => {
    const captured = captureMarkup()
    stubImage()
    const withBox =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 20 10"><rect/></svg>'
    await rasterizeSvg(new Blob([withBox]), 2)
    expect(captured.markup[0]).toContain('viewBox="0 0 20 10"')
    captured.restore()
  })

  it('overrides an inline style width/height, which would otherwise beat the scaled attributes', async () => {
    const captured = captureMarkup()
    stubImage()
    // width/height on <svg> are CSS geometry properties, so this style declaration wins
    // over the attributes and a 2x request would have come back at the SVG's own size.
    const styled =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" style="width:100px;height:50px;fill:red"><rect/></svg>'
    const result = await rasterizeSvg(new Blob([styled]), 2)
    expect(result).toMatchObject({ width: 200, height: 100 })
    expect(captured.markup[0]).not.toMatch(/width:\s*100px/)
    expect(captured.markup[0]).not.toMatch(/height:\s*50px/)
    // Only the two size declarations are replaced; the rest of the root's styling stays.
    expect(captured.markup[0]).toMatch(/fill:\s*red/)
    captured.restore()
  })

  it('wins over a stylesheet inside the document, not just an inline style', async () => {
    const captured = captureMarkup()
    stubImage()
    // The other half of "width/height are CSS properties": a `<style>` block in the
    // document beats the attributes exactly as an inline declaration does, so a 2x
    // request on this file rendered at 100% of nothing until the size was set
    // !important.
    const styled =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><style>svg{width:100%;height:100%}</style><rect/></svg>'
    const result = await rasterizeSvg(new Blob([styled]), 2)
    expect(result).toMatchObject({ width: 200, height: 100 })
    expect(captured.markup[0]).toMatch(/width:\s*200px\s*!important/)
    expect(captured.markup[0]).toMatch(/height:\s*100px\s*!important/)
    captured.restore()
  })

  it('resolves an absolute unit, as an Inkscape page-sized export uses', async () => {
    const captured = captureMarkup()
    stubImage()
    // Inkscape writes physical page sizes, with a viewBox in user units that happens to
    // be the millimetre count. Treating "210mm" as unresolvable falls back to that
    // viewBox and rasterizes A4 as a 210x297 postage stamp.
    const a4 =
      '<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297"><rect/></svg>'
    const result = await rasterizeSvg(new Blob([a4]), 1)
    // 210mm at 96dpi is 793.7px, 297mm is 1122.5px.
    expect(result).toMatchObject({ width: 794, height: 1123 })
    captured.restore()
  })

  it('squares off an SVG that gives one side and no viewBox, rather than padding the other', async () => {
    const captured = captureMarkup()
    stubImage()
    const widthOnly = '<svg xmlns="http://www.w3.org/2000/svg" width="100"><rect/></svg>'
    const result = await rasterizeSvg(new Blob([widthOnly]), 1)
    // 100x512 would have put the drawing in the top fifth of the output and called the
    // empty remainder image.
    expect(result).toMatchObject({ width: 100, height: 100 })
    captured.restore()
  })

  it('renders at 1x when the scale is not a usable number, rather than writing NaN', async () => {
    const captured = captureMarkup()
    stubImage()
    const result = await rasterizeSvg(new Blob([SQUARE]), Number.NaN)
    expect(result).toMatchObject({ width: 100, height: 50 })
    captured.restore()
  })
})

describe('rasterizeSvg failures', () => {
  it('reports a malformed SVG with a reason rather than producing a blank image', async () => {
    stubImage()
    await expect(
      rasterizeSvg(new Blob(['<svg><rect width="10"'], { type: 'image/svg+xml' }), 1),
    ).rejects.toMatchObject({ reason: 'unreadable' })
    await expect(rasterizeSvg(new Blob(['<svg><rect width="10"']), 1)).rejects.toThrow(
      /malformed|incomplete|parsed/i,
    )
  })

  it('rejects well-formed XML that is not an SVG at all', async () => {
    stubImage()
    await expect(
      rasterizeSvg(new Blob(['<note><body>hello</body></note>']), 1),
    ).rejects.toThrow(/not an SVG/i)
  })

  it('reports a refused allocation as a per-file failure, not a raw DOMException', async () => {
    const captured = captureMarkup()
    stubImage()
    // What the browser does when a huge vector at 4x asks for a gigabyte of pixels.
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new DOMException('out of memory'))),
    )
    await expect(rasterizeSvg(new Blob([SQUARE]), 4)).rejects.toMatchObject({
      reason: 'unreadable',
    })
    // And the blob URL still goes, the same as every other failure path.
    expect(captured.revoked).toEqual(['blob:fake'])
    captured.restore()
  })

  it('revokes the blob URL even when rendering fails, so the SVG is not pinned in memory', async () => {
    const captured = captureMarkup()
    class FailingImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', FailingImage)

    await expect(rasterizeSvg(new Blob([SQUARE]), 1)).rejects.toMatchObject({
      reason: 'unreadable',
    })
    expect(captured.revoked).toEqual(['blob:fake'])
    captured.restore()
  })
})
