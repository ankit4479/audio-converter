/**
 * Which encoder actually produces a given image format in this browser (E2.1, issue
 * #31).
 *
 * `OffscreenCanvas.convertToBlob` is the cheap path: no WASM to download, hardware
 * paths where the browser has them. But its format support is uneven - it silently
 * falls back to PNG for a type it does not implement rather than failing - so every
 * lossy target is probed once and the answer cached, exactly the way
 * engine/webcodecs.ts probes audio encoders for the same reason.
 *
 * Where canvas can't do it, jSquash's WASM encoders (Apache-2.0, the Squoosh codecs)
 * take over. Their imports are dynamic so the WASM only downloads for a conversion
 * that genuinely needs it - AVIF always, WebP only on a browser lacking canvas WebP.
 */

/** A canvas MIME type we might ask for. PNG is not here: it is the fallback every
 *  browser implements, so there is nothing to probe. */
export type EncodableMime = 'image/jpeg' | 'image/webp' | 'image/avif'

/**
 * True when convertToBlob honors this type instead of quietly returning PNG. Probed
 * on a 1x1 canvas and cached per type, since the answer can't change within a
 * session.
 */
const canvasSupport = new Map<EncodableMime, Promise<boolean>>()

export function canvasEncodes(mime: EncodableMime): Promise<boolean> {
  const cached = canvasSupport.get(mime)
  if (cached) return cached
  const probe = probeCanvas(mime)
  canvasSupport.set(mime, probe)
  return probe
}

async function probeCanvas(mime: EncodableMime): Promise<boolean> {
  if (typeof OffscreenCanvas === 'undefined') return false
  try {
    const canvas = new OffscreenCanvas(1, 1)
    // Getting a context matters: convertToBlob on a canvas that never had one can
    // throw in some engines.
    canvas.getContext('2d')
    const blob = await canvas.convertToBlob({ type: mime })
    // The tell for an unsupported type: a blob typed as something else (PNG).
    return blob.type === mime
  } catch {
    return false
  }
}

/** Test seam: lets a test pin the probe result instead of depending on whatever the
 *  environment's canvas happens to support. */
export function _setCanvasSupportForTests(mime: EncodableMime, supported: boolean): void {
  canvasSupport.set(mime, Promise.resolve(supported))
}

export function _resetCanvasSupportForTests(): void {
  canvasSupport.clear()
}

/**
 * Encodes already-decoded pixels with a WASM encoder. Only reached for a format
 * this browser's canvas can't produce, so the download is never on the common path.
 *
 * quality is 0-100 for both encoders here, matching the settings schema's slider and
 * canvas's own 0-1 scale after conversion.
 */
export async function encodeWithWasm(
  mime: 'image/webp' | 'image/avif',
  data: ImageData,
  quality: number,
): Promise<Blob> {
  // Imported by their encode subpath, not the package root: the root re-exports
  // decode too, which put avif_dec.wasm (1.1MB) and webp_dec.wasm (135KB) in the
  // build for a code path that never runs - decoding is createImageBitmap's job here.
  if (mime === 'image/avif') {
    const { default: encode } = await import('@jsquash/avif/encode')
    // jSquash AVIF's quality is 0-100, the same scale as the slider.
    return new Blob([await encode(data, { quality })], { type: mime })
  }
  const { default: encode } = await import('@jsquash/webp/encode')
  return new Blob([await encode(data, { quality })], { type: mime })
}
