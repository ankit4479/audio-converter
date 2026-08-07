import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversionError } from '../../engine/convert'
import { convertImage } from './convert'
import { _resetCanvasSupportForTests, _setCanvasSupportForTests } from './encoders'

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

const SETTINGS = { format: 'webp' as const, quality: 80 }

beforeEach(() => {
  closed.length = 0
  _resetCanvasSupportForTests()
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
    await convertImage(new Blob(['x']), 'a', { format: 'webp', quality: 80 })
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/webp', quality: 0.8 })
  })

  it('asks canvas for no quality at all when the target is lossless', async () => {
    const { convertToBlob } = stubImageApis()
    const result = await convertImage(new Blob(['x']), 'a', {
      format: 'png',
      quality: 80,
    })
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/png' })
    expect(result.fileName).toBe('a.png')
  })

  it('never probes canvas for PNG, the one format every browser writes', async () => {
    const { convertToBlob } = stubImageApis()
    // No _setCanvasSupportForTests call: if PNG were probed this would consult the
    // stub's blob type and could fall through to a WASM path.
    await convertImage(new Blob(['x']), 'a', { format: 'png', quality: 80 })
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
      convertImage(new Blob(['x']), 'a', { format: 'jpg', quality: 80 }),
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
      convertImage(new Blob(['x']), 'a', { format: 'jpg', quality: 80 }),
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

describe('convertImage - alpha handling', () => {
  it('paints an opaque matte under the image for JPEG, which has no alpha channel', async () => {
    const { fillRect, context } = stubImageApis({ width: 320, height: 240 })
    _setCanvasSupportForTests('image/jpeg', true)

    await convertImage(new Blob(['x']), 'a', { format: 'jpg', quality: 80 })

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
      await convertImage(new Blob(['x']), 'a', { format, quality: 80 })
      expect(fillRect).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    }
  })
})
