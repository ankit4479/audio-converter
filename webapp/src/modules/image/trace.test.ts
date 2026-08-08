import { beforeEach, describe, expect, it, vi } from 'vitest'
import { looksPhotographic, traceToSvg, _resetTracerForTests } from './trace'

/** jsdom has no real ImageData constructor, so a plain object of the same shape stands
 *  in - traceToSvg and looksPhotographic only ever read .width/.height/.data. */
function pixels(width: number, height: number, fill: (x: number, y: number) => number[]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y)
      const offset = (y * width + x) * 4
      data[offset] = r
      data[offset + 1] = g
      data[offset + 2] = b
      data[offset + 3] = a
    }
  }
  return { width, height, data } as ImageData
}

function flatLogo() {
  // Two flat fills plus a hard antialiased edge in between - the actual shape of a
  // simple logo, not just a uniform block.
  return pixels(64, 64, (x) => (x < 32 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
}

/** A deterministic integer hash (not Math.random, so the test is reproducible) that
 *  scatters colours the way real photo noise does - a smooth gradient turned out to
 *  compress into only ~200 quantized buckets, well under the threshold, because two of
 *  its three channels are linear in one coordinate each. */
function hash(n: number): number {
  n = n ^ 61 ^ (n >>> 16)
  n = n + (n << 3)
  n = n ^ (n >>> 4)
  n = Math.imul(n, 0x27d4eb2d)
  n = n ^ (n >>> 15)
  return n >>> 0
}

function photo() {
  return pixels(64, 64, (x, y) => {
    const h = hash((x * 73856093) ^ (y * 19349663))
    return [h & 0xff, (h >>> 8) & 0xff, (h >>> 16) & 0xff, 255]
  })
}

const TRACE_SETTINGS = { traceColors: '8' as const, traceDespeckle: 8, traceSmoothing: 1 }

beforeEach(() => {
  _resetTracerForTests()
})

describe('looksPhotographic', () => {
  it('reads a flat two-colour logo as not photographic', () => {
    expect(looksPhotographic(flatLogo())).toBe(false)
  })

  it('reads a smooth gradient as photographic', () => {
    expect(looksPhotographic(photo())).toBe(true)
  })

  it('ignores fully transparent pixels, so a transparent background does not count as noise', () => {
    // Every pixel a different colour, but all transparent - should read as flat, not
    // photographic, because there is no real colour information here at all.
    const transparent = pixels(64, 64, (x, y) => [x * 4, y * 4, (x + y) * 2, 0])
    expect(looksPhotographic(transparent)).toBe(false)
  })
})

describe('traceToSvg', () => {
  function stubTracer(svg: string) {
    const imagedataToSVG = vi.fn(() => svg)
    vi.doMock('imagetracerjs', () => ({ default: { imagedataToSVG } }))
    return { imagedataToSVG }
  }

  it('passes the settings through to the tracer on imagetracerjs’s own option names', async () => {
    const { imagedataToSVG } = stubTracer('<svg><path d="M0 0"/></svg>')

    await traceToSvg(flatLogo(), {
      traceColors: '16',
      traceDespeckle: 4,
      traceSmoothing: 2,
    })

    expect(imagedataToSVG).toHaveBeenCalledWith(
      expect.objectContaining({ width: 64, height: 64 }),
      expect.objectContaining({
        numberofcolors: 16,
        pathomit: 4,
        ltres: 2,
        qtres: 2,
        // Pre-blur would soften the crisp edges that are the reason to vectorize flat
        // artwork in the first place.
        blurradius: 0,
      }),
    )
    vi.doUnmock('imagetracerjs')
  })

  it('returns the traced SVG with no note for flat artwork', async () => {
    stubTracer('<svg><path d="M0 0"/></svg>')

    const result = await traceToSvg(flatLogo(), TRACE_SETTINGS)

    expect(result.svg).toContain('<path')
    expect(result.note).toBeUndefined()
    vi.doUnmock('imagetracerjs')
  })

  it('attaches a warning note when the input looks photographic', async () => {
    stubTracer('<svg><path d="M0 0"/></svg>')

    const result = await traceToSvg(photo(), TRACE_SETTINGS)

    expect(result.note).toMatch(/looks like a photo/i)
    vi.doUnmock('imagetracerjs')
  })

  it('rejects when the tracer finds nothing to draw, rather than handing over a blank picture', async () => {
    stubTracer('<svg width="64" height="64"></svg>')

    await expect(traceToSvg(flatLogo(), TRACE_SETTINGS)).rejects.toMatchObject({
      reason: 'unknown',
    })
    await expect(traceToSvg(flatLogo(), TRACE_SETTINGS)).rejects.toThrow(
      /nothing was found to trace/i,
    )
    vi.doUnmock('imagetracerjs')
  })

  it('reports a tracer throw as a typed per-file error, not a raw exception', async () => {
    vi.doMock('imagetracerjs', () => ({
      default: {
        imagedataToSVG: () => {
          throw new Error('tracer blew up')
        },
      },
    }))

    await expect(traceToSvg(flatLogo(), TRACE_SETTINGS)).rejects.toMatchObject({
      reason: 'unknown',
    })
    vi.doUnmock('imagetracerjs')
  })

  it('reports a failed tracer load as a typed error and lets the next file retry', async () => {
    let attempts = 0
    vi.doMock('imagetracerjs', () => {
      attempts += 1
      if (attempts === 1) throw new Error('network blip')
      return { default: { imagedataToSVG: () => '<svg><path d="M0 0"/></svg>' } }
    })

    await expect(traceToSvg(flatLogo(), TRACE_SETTINGS)).rejects.toMatchObject({
      reason: 'unknown',
    })
    // The failed load must not be cached, or every remaining file in the batch would
    // fail even after the transient problem clears.
    const result = await traceToSvg(flatLogo(), TRACE_SETTINGS)
    expect(result.svg).toContain('<path')
    vi.doUnmock('imagetracerjs')
  })
})
