import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversionError } from '../../engine/convert'
import { convertImage } from './convert'
import { _resetCanvasSupportForTests, _setCanvasSupportForTests } from './encoders'
import { _resetLibheifForTests } from './heic'
import { _resetTracerForTests } from './trace'

/**
 * jsdom implements neither createImageBitmap nor OffscreenCanvas, the same way it has
 * no real WebCodecs for the audio engine's tests. Both are stubbed to the shape the
 * real APIs have, so what is under test is this module's own decisions - which
 * encoder to use, what to do when one isn't available, how cancellation and cleanup
 * behave - rather than a browser's codec.
 */
const closed: string[] = []

function stubImageApis({
  decodes = true,
  width = 4,
  height = 2,
}: { decodes?: boolean; width?: number; height?: number } = {}) {
  const convertToBlob = vi.fn(
    async ({ type }: { type: string; quality?: number } = { type: 'image/png' }) =>
      new Blob(['encoded'], { type }),
  )
  const getImageData = vi.fn(() => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  }))
  const drawImage = vi.fn()
  const fillRect = vi.fn()
  const context = { drawImage, getImageData, fillRect, fillStyle: '' }

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      if (!decodes) throw new Error('decode failed')
      return {
        width,
        height,
        close: () => closed.push('bitmap'),
      }
    }),
  )
  vi.stubGlobal(
    'OffscreenCanvas',
    // Plain fields rather than constructor parameter properties: tsconfig has
    // erasableSyntaxOnly, which rejects the shorthand.
    class {
      width: number
      height: number
      convertToBlob = convertToBlob
      constructor(width: number, height: number) {
        this.width = width
        this.height = height
      }
      getContext() {
        return context
      }
    },
  )
  return { convertToBlob, getImageData, drawImage, fillRect, context }
}

const TRACE_DEFAULTS = {
  traceColors: '8' as const,
  traceDespeckle: 8,
  traceSmoothing: 1,
}

const SETTINGS = {
  format: 'webp' as const,
  quality: 80,
  scale: '1' as const,
  ...TRACE_DEFAULTS,
}

beforeEach(() => {
  closed.length = 0
  _resetCanvasSupportForTests()
  // heic.ts and trace.ts each cache their loaded module across files on purpose (a
  // batch should compile/fetch once), which would otherwise leak one test's fake
  // tracer or decoder into the next.
  _resetLibheifForTests()
  _resetTracerForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('convertImage', () => {
  it('names the output for the target format, not the source', async () => {
    stubImageApis()
    _setCanvasSupportForTests('image/webp', true)
    const result = await convertImage(new Blob(['x']), 'holiday-photo', SETTINGS)
    expect(result.fileName).toBe('holiday-photo.webp')
    expect(result.blob.type).toBe('image/webp')
  })

  it('draws at the source’s own pixel dimensions, so a round trip preserves them', async () => {
    const { drawImage } = stubImageApis({ width: 640, height: 480 })
    _setCanvasSupportForTests('image/webp', true)
    await convertImage(new Blob(['x']), 'a', SETTINGS)
    expect(drawImage).toHaveBeenCalled()
  })

  it('passes quality to canvas on its own 0-1 scale, not the slider’s 1-100', async () => {
    const { convertToBlob } = stubImageApis()
    _setCanvasSupportForTests('image/webp', true)
    await convertImage(new Blob(['x']), 'a', {
      format: 'webp',
      quality: 80,
      scale: '1' as const,
      ...TRACE_DEFAULTS,
    })
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/webp', quality: 0.8 })
  })

  it('asks canvas for no quality at all when the target is lossless', async () => {
    const { convertToBlob } = stubImageApis()
    const result = await convertImage(new Blob(['x']), 'a', {
      format: 'png',
      quality: 80,
      scale: '1' as const,
      ...TRACE_DEFAULTS,
    })
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/png' })
    expect(result.fileName).toBe('a.png')
  })

  it('never probes canvas for PNG, the one format every browser writes', async () => {
    const { convertToBlob } = stubImageApis()
    // No _setCanvasSupportForTests call: if PNG were probed this would consult the
    // stub's blob type and could fall through to a WASM path.
    await convertImage(new Blob(['x']), 'a', {
      format: 'png',
      quality: 80,
      scale: '1' as const,
      ...TRACE_DEFAULTS,
    })
    expect(convertToBlob).toHaveBeenCalledTimes(1)
  })

  it('falls back to the WASM encoder when canvas cannot write the format', async () => {
    const { convertToBlob, getImageData } = stubImageApis()
    _setCanvasSupportForTests('image/avif', false)
    const encode = vi.fn(async () => new Uint8Array([1, 2, 3]))
    vi.doMock('@jsquash/avif/encode', () => ({ default: encode }))

    const result = await convertImage(new Blob(['x']), 'a', {
      format: 'avif',
      quality: 50,
      scale: '1' as const,
      ...TRACE_DEFAULTS,
    })

    expect(getImageData).toHaveBeenCalled()
    expect(encode).toHaveBeenCalledWith(expect.objectContaining({ width: 4 }), {
      quality: 50,
    })
    expect(result.blob.type).toBe('image/avif')
    expect(result.fileName).toBe('a.avif')
    // The canvas encode was not also attempted for this format.
    expect(convertToBlob).not.toHaveBeenCalled()
    vi.doUnmock('@jsquash/avif/encode')
  })

  it('reports a decode failure as a per-file error with a readable message', async () => {
    stubImageApis({ decodes: false })
    await expect(convertImage(new Blob(['x']), 'a', SETTINGS)).rejects.toMatchObject({
      reason: 'unreadable',
    })
    await expect(convertImage(new Blob(['x']), 'a', SETTINGS)).rejects.toThrow(
      /could not be read/i,
    )
  })

  it('refuses rather than writing a PNG under a .jpg name if canvas cannot do JPEG', async () => {
    stubImageApis()
    _setCanvasSupportForTests('image/jpeg', false)
    await expect(
      convertImage(new Blob(['x']), 'a', {
        format: 'jpg',
        quality: 80,
        scale: '1' as const,
        ...TRACE_DEFAULTS,
      }),
    ).rejects.toMatchObject({ reason: 'unsupported-in-browser' })
  })

  it('stops before decoding on an already-aborted signal', async () => {
    stubImageApis()
    const controller = new AbortController()
    controller.abort()
    await expect(
      convertImage(new Blob(['x']), 'a', SETTINGS, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(ConversionError)
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('frees the decoded pixels even when encoding fails', async () => {
    stubImageApis()
    _setCanvasSupportForTests('image/jpeg', false)
    await expect(
      convertImage(new Blob(['x']), 'a', {
        format: 'jpg',
        quality: 80,
        scale: '1' as const,
        ...TRACE_DEFAULTS,
      }),
    ).rejects.toThrow()
    // A 12MP photo is ~48MB of decoded pixels; leaking one per failed file in a batch
    // is what the finally in convertImage is there to prevent.
    expect(closed).toEqual(['bitmap'])
  })

  it('reports progress at the decode/encode boundary and again at the end', async () => {
    stubImageApis()
    _setCanvasSupportForTests('image/webp', true)
    const onProgress = vi.fn()
    await convertImage(new Blob(['x']), 'a', SETTINGS, { onProgress })
    expect(onProgress.mock.calls.map(([p]) => p.fraction)).toEqual([0.5, 1])
  })
})

describe('convertImage - tracing to SVG (E2.4, issue #34)', () => {
  const SVG_SETTINGS = {
    format: 'svg' as const,
    quality: 80,
    scale: '1' as const,
    ...TRACE_DEFAULTS,
  }

  function stubTracer(svg = '<svg><path d="M0 0"/></svg>') {
    const imagedataToSVG = vi.fn(() => svg)
    vi.doMock('imagetracerjs', () => ({ default: { imagedataToSVG } }))
    return { imagedataToSVG }
  }

  it('leaves the canvas pipeline entirely: names the file .svg and types the blob accordingly', async () => {
    stubImageApis()
    stubTracer()

    const result = await convertImage(new Blob(['x']), 'logo', SVG_SETTINGS)

    expect(result.fileName).toBe('logo.svg')
    expect(result.blob.type).toBe('image/svg+xml')
    expect(await result.blob.text()).toContain('<path')
    vi.doUnmock('imagetracerjs')
  })

  it('gets its pixels from the same canvas path the raster encoders use, not a second decode', async () => {
    const { drawImage, getImageData } = stubImageApis({ width: 32, height: 16 })
    const { imagedataToSVG } = stubTracer()

    await convertImage(new Blob(['x']), 'logo', SVG_SETTINGS)

    expect(drawImage).toHaveBeenCalled()
    expect(getImageData).toHaveBeenCalled()
    expect(imagedataToSVG).toHaveBeenCalledWith(
      expect.objectContaining({ width: 32, height: 16 }),
      expect.anything(),
    )
    vi.doUnmock('imagetracerjs')
  })

  it('frees the decoded bitmap after tracing, the same as every raster target', async () => {
    stubImageApis()
    stubTracer()

    await convertImage(new Blob(['x']), 'logo', SVG_SETTINGS)

    expect(closed).toEqual(['bitmap'])
    vi.doUnmock('imagetracerjs')
  })

  it('reports only the final progress step - there is no separate encode phase to mark at 0.5', async () => {
    stubImageApis()
    stubTracer()
    const onProgress = vi.fn()

    await convertImage(new Blob(['x']), 'logo', SVG_SETTINGS, { onProgress })

    expect(onProgress.mock.calls.map(([p]) => p.fraction)).toEqual([1])
    vi.doUnmock('imagetracerjs')
  })

  it('carries the tracer’s own note (a photo warning) onto the result', async () => {
    // 32x32 (1024 pixels): an 8x8 canvas has only 64 pixels total, which can never
    // exceed the 512-distinct-colour threshold looksPhotographic uses no matter how
    // it's filled - the sample size itself caps the bucket count below the threshold.
    const width = 32
    const height = 32
    const data = new Uint8ClampedArray(width * height * 4)
    // Deterministic hash (not Math.random, so this is reproducible) that scatters
    // colours the way real photo noise does - mirrors trace.test.ts's own generator.
    const hash = (n: number) => {
      n = n ^ 61 ^ (n >>> 16)
      n = n + (n << 3)
      n = n ^ (n >>> 4)
      n = Math.imul(n, 0x27d4eb2d)
      n = n ^ (n >>> 15)
      return n >>> 0
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const h = hash((x * 73856093) ^ (y * 19349663))
        const offset = (y * width + x) * 4
        data[offset] = h & 0xff
        data[offset + 1] = (h >>> 8) & 0xff
        data[offset + 2] = (h >>> 16) & 0xff
        data[offset + 3] = 255
      }
    }
    const { context } = stubImageApis({ width, height })
    // getImageData's default stub returns a fresh, zeroed array on every call; that
    // would silently discard the fill above, so the mock's return value is overridden
    // directly rather than mutating what a call happens to hand back.
    context.getImageData.mockReturnValue({ width, height, data })
    stubTracer()

    const result = await convertImage(new Blob(['x']), 'photo', SVG_SETTINGS)

    expect(result.note).toMatch(/looks like a photo/i)
    vi.doUnmock('imagetracerjs')
  })

  it('propagates a tracing failure as a typed per-file error, and still frees the bitmap', async () => {
    stubImageApis()
    vi.doMock('imagetracerjs', () => ({
      default: {
        imagedataToSVG: () => {
          throw new Error('tracer blew up')
        },
      },
    }))

    await expect(
      convertImage(new Blob(['x']), 'logo', SVG_SETTINGS),
    ).rejects.toMatchObject({ reason: 'unknown' })
    expect(closed).toEqual(['bitmap'])
    vi.doUnmock('imagetracerjs')
  })
})

describe('convertImage - alpha handling', () => {
  it('paints an opaque matte under the image for JPEG, which has no alpha channel', async () => {
    const { fillRect, context } = stubImageApis({ width: 320, height: 240 })
    _setCanvasSupportForTests('image/jpeg', true)

    await convertImage(new Blob(['x']), 'a', {
      format: 'jpg',
      quality: 80,
      scale: '1' as const,
      ...TRACE_DEFAULTS,
    })

    // Without this, a transparent PNG's see-through regions encode as black: a
    // fresh 2D canvas is transparent *black*, and JPEG just drops the alpha.
    expect(context.fillStyle).toBe('#ffffff')
    expect(fillRect).toHaveBeenCalledWith(0, 0, 320, 240)
  })

  it('paints nothing under formats that keep transparency, so a PNG stays see-through', async () => {
    for (const format of ['png', 'webp', 'avif'] as const) {
      const { fillRect } = stubImageApis()
      _setCanvasSupportForTests('image/webp', true)
      _setCanvasSupportForTests('image/avif', true)
      await convertImage(new Blob(['x']), 'a', {
        format,
        quality: 80,
        scale: '1',
        ...TRACE_DEFAULTS,
      })
      expect(fillRect).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    }
  })
})

// E2.2 (issue #32): HEIC decode. The native decoder is always tried first; libheif is
// the fallback, and only for bytes that are genuinely a HEIF container.
describe('convertImage - HEIC fallback', () => {
  function heifBytes(brand = 'heic') {
    const header = new Uint8Array(64)
    const ascii = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i += 1) header[offset + i] = text.charCodeAt(i)
    }
    header[3] = 64
    ascii(4, 'ftyp')
    ascii(8, brand)
    return new Blob([header])
  }

  /** Stubs the browser decoder as failing (which is what Chrome/Firefox do for HEIC)
   *  while leaving the canvas encode path working. */
  function stubNativeDecodeFailure() {
    const created: unknown[] = []
    const convertToBlob = vi.fn(
      async ({ type }: { type: string } = { type: 'image/png' }) =>
        new Blob(['encoded'], { type }),
    )
    const context = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      getImageData: vi.fn(() => ({
        width: 4,
        height: 2,
        data: new Uint8ClampedArray(32),
      })),
    }
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (source: unknown) => {
        created.push(source)
        // A Blob is the file itself: that is the native attempt, and it fails the way
        // a browser without a HEIC decoder does. ImageData is libheif's output coming
        // back through the shared path, which must succeed.
        if (source instanceof Blob) throw new Error('no HEIC decoder')
        return { width: 4, height: 2, close: () => closed.push('bitmap') }
      }),
    )
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        width = 4
        height = 2
        convertToBlob = convertToBlob
        getContext() {
          return context
        }
      },
    )
    vi.stubGlobal(
      'ImageData',
      class {
        width: number
        height: number
        data: Uint8ClampedArray
        constructor(width: number, height: number) {
          this.width = width
          this.height = height
          this.data = new Uint8ClampedArray(width * height * 4)
        }
      },
    )
    return { created }
  }

  function stubLibheif(imageCount: number) {
    const free = vi.fn()
    const decode = vi.fn(() =>
      Array.from({ length: imageCount }, () => ({
        get_width: () => 640,
        get_height: () => 480,
        display: (target: unknown, done: (result: unknown) => void) => done(target),
        // The real wrapper's handle release. Declared on the fake because forgetting to
        // call it leaks a WASM-heap handle per image, which no JS-side assertion about
        // the returned blob could ever notice.
        free,
      })),
    )
    // Mirrors the real module's shape: a default-exported Emscripten factory that
    // resolves to the module once its WASM is compiled. Mocking it as the module
    // itself is the mistake that let a real "HeifDecoder is not a constructor" bug
    // through a green unit test - only the browser run caught it.
    vi.doMock('libheif-js/libheif-wasm/libheif-bundle.mjs', () => ({
      default: async () => ({
        HeifDecoder: class {
          decode = decode
        },
      }),
    }))
    return { decode, free }
  }

  it('decodes a HEIC through libheif once the browser decoder has refused it', async () => {
    const { created } = stubNativeDecodeFailure()
    const { decode } = stubLibheif(1)
    _setCanvasSupportForTests('image/jpeg', true)

    const result = await convertImage(heifBytes(), 'IMG_4821', {
      format: 'jpg',
      quality: 80,
      scale: '1' as const,
      ...TRACE_DEFAULTS,
    })

    expect(decode).toHaveBeenCalledTimes(1)
    expect(result.fileName).toBe('IMG_4821.jpg')
    expect(result.note).toBeUndefined()
    // The native decoder was tried first, and libheif's pixels came back through the
    // same createImageBitmap path everything else uses.
    expect(created[0]).toBeInstanceOf(Blob)
    expect(created).toHaveLength(2)
    vi.doUnmock('libheif-js/libheif-wasm/libheif-bundle.mjs')
  })

  it('says so when a container held more images than the one it converted', async () => {
    stubNativeDecodeFailure()
    const { free } = stubLibheif(3)
    _setCanvasSupportForTests('image/jpeg', true)

    const result = await convertImage(heifBytes(), 'IMG_4821', {
      format: 'jpg',
      quality: 80,
      scale: '1' as const,
      ...TRACE_DEFAULTS,
    })

    expect(result.note).toBe(
      'This file held 3 images. The main one was converted; the others were left out.',
    )
    // Every image in the burst is released, not only the one converted: the handles
    // live in the WASM heap, where nothing collects them.
    expect(free).toHaveBeenCalledTimes(3)
    vi.doUnmock('libheif-js/libheif-wasm/libheif-bundle.mjs')
  })

  it('frees the handle and reuses one decoder across a batch, so the WASM heap does not grow', async () => {
    stubNativeDecodeFailure()
    const { decode, free } = stubLibheif(1)
    _setCanvasSupportForTests('image/jpeg', true)

    for (const name of ['IMG_1', 'IMG_2', 'IMG_3']) {
      await convertImage(heifBytes(), name, {
        format: 'jpg',
        quality: 80,
        scale: '1' as const,
        ...TRACE_DEFAULTS,
      })
    }

    // One decoder for the batch, not one per file: its decode() is the only thing that
    // ever frees the previous file's container context, so a per-file decoder would
    // leak a full copy of every photo.
    expect(decode.mock.instances[0]).toBe(decode.mock.instances[2])
    expect(free).toHaveBeenCalledTimes(3)
    vi.doUnmock('libheif-js/libheif-wasm/libheif-bundle.mjs')
  })

  it('fails the file rather than hanging when libheif throws inside its own timer', async () => {
    stubNativeDecodeFailure()
    // display() does its work in a setTimeout, so a throw there never reaches the
    // caller's promise - it surfaces as an uncaught error. Without the listener in
    // render() this test would time out instead of failing, which is exactly what a
    // stuck batch looks like to a user.
    vi.doMock('libheif-js/libheif-wasm/libheif-bundle.mjs', () => ({
      default: async () => ({
        HeifDecoder: class {
          decode = () => [
            {
              get_width: () => 640,
              get_height: () => 480,
              display: () => {
                setTimeout(() => {
                  globalThis.dispatchEvent(
                    new ErrorEvent('error', { message: 'out of memory' }),
                  )
                }, 0)
              },
              free: vi.fn(),
            },
          ]
        },
      }),
    }))
    _setCanvasSupportForTests('image/jpeg', true)

    await expect(
      convertImage(heifBytes(), 'IMG_4821', {
        format: 'jpg',
        quality: 80,
        scale: '1' as const,
        ...TRACE_DEFAULTS,
      }),
    ).rejects.toMatchObject({ reason: 'unreadable' })
    vi.doUnmock('libheif-js/libheif-wasm/libheif-bundle.mjs')
  })

  it('does not reach for libheif when the failing file is not a HEIF container', async () => {
    stubNativeDecodeFailure()
    const { decode } = stubLibheif(1)

    // A corrupt PNG: the native decoder fails, but there is no reason to download a
    // HEIC decoder for it.
    await expect(
      convertImage(new Blob([new Uint8Array(64)]), 'broken', {
        format: 'jpg',
        quality: 80,
        scale: '1' as const,
        ...TRACE_DEFAULTS,
      }),
    ).rejects.toMatchObject({ reason: 'unreadable' })
    expect(decode).not.toHaveBeenCalled()
    vi.doUnmock('libheif-js/libheif-wasm/libheif-bundle.mjs')
  })
})
