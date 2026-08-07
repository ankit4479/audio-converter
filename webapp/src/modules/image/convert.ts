/**
 * The image conversion core (E2.1, issue #31). Runs off the main thread (see
 * convert.worker.ts for the Comlink entry point); this module depends only on
 * standard Web APIs plus the lazily-imported WASM encoders, so it is reviewable and
 * testable without a Worker in the loop - the same split engine/convert.ts uses for
 * audio.
 *
 * Decode is always `createImageBitmap`: it is the browser's own decoder, it works in
 * a worker, and it handles every raster format the browser knows without a per-format
 * branch here. Encode prefers `OffscreenCanvas.convertToBlob` and falls back to a WASM
 * encoder where canvas can't produce the format (see encoders.ts).
 */
import {
  ConversionError,
  type ConvertProgress,
  type ConvertResult,
} from '../../engine/convert'
// Type-only, so it is erased at build time and this worker-side module never pulls
// platform/graph.ts (and through it engine/formats.ts's Mediabunny tables) into the
// image worker's chunk. Taking the union from the graph rather than restating it here
// is what makes the tables below fail to compile if a format is added to the graph
// without an entry, instead of producing a blob typed `undefined` at runtime.
import type { ImageFormatId } from '../../platform/graph'
import { canvasEncodes, encodeWithWasm, type EncodableMime } from './encoders'

export type { ImageFormatId }

export interface ImageSettings {
  /** Output format. Named `format` rather than `codec` because there is no codec
   *  table here - the browser is the codec. See ConverterModule.targetSettingKey. */
  format: ImageFormatId
  /** 1-100 for the lossy formats. Ignored for PNG, which is lossless. */
  quality: number
}

const MIME: Record<ImageFormatId, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
}

/** Whether the format keeps an alpha channel. Only JPEG doesn't, which is why it is
 *  the one target that needs a matte painted under the image first (see encode()). */
const SUPPORTS_ALPHA: Record<ImageFormatId, boolean> = {
  png: true,
  jpg: false,
  webp: true,
  avif: true,
}

const EXTENSION: Record<ImageFormatId, string> = {
  png: 'png',
  jpg: 'jpg',
  webp: 'webp',
  avif: 'avif',
}

export async function convertImage(
  file: Blob,
  baseName: string,
  settings: ImageSettings,
  options: {
    onProgress?: (progress: ConvertProgress) => void
    signal?: AbortSignal
  } = {},
): Promise<ConvertResult> {
  const { signal, onProgress } = options
  throwIfCanceled(signal)

  const bitmap = await decode(file)

  // Everything after the decode runs inside the try, including the cancellation
  // check: a batch cancelled while this file was decoding would otherwise throw
  // before the `finally` existed and leak the bitmap it just paid for - ~48MB per
  // cancelled 12MP photo, which is the leak the close() below exists to prevent.
  try {
    throwIfCanceled(signal)
    // Decode is the slow half for a large photo and there is no sub-step to report
    // from inside it, so progress is reported at the one honest boundary rather than
    // faked as a smooth ramp. processedSeconds is 0 throughout: it is the audio
    // engine's own unit (seconds of input consumed) and an image has no duration, so
    // reporting anything else would be inventing a number.
    onProgress?.({ fraction: 0.5, processedSeconds: 0 })

    const blob = await encode(bitmap, settings)
    throwIfCanceled(signal)
    onProgress?.({ fraction: 1, processedSeconds: 0 })
    return { blob, fileName: `${baseName}.${EXTENSION[settings.format]}` }
  } finally {
    // Frees the decoded pixels immediately rather than waiting for GC - a batch of
    // 12MP photos holds ~48MB each otherwise.
    bitmap.close()
  }
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    // imageOrientation is stated rather than left to the default: the spec's default
    // became 'from-image' only in 2021, and engines that still default to 'none'
    // hand back the raw pixels of an EXIF-rotated photo (every phone camera writes
    // one). Canvas output carries no EXIF, so the rotation isn't merely ignored -
    // it is dropped, and a portrait photo is written permanently sideways.
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (cause) {
    // Everything reaching here is "the browser could not decode this": a corrupt
    // file, or a format it has no decoder for (an AVIF on an older browser). Both
    // are per-file failures the batch reports, not reasons to stop.
    throw new ConversionError(
      'unreadable',
      'This image could not be read. It may be corrupted, or in a format this browser cannot open.',
      { cause },
    )
  }
}

async function encode(bitmap: ImageBitmap, settings: ImageSettings): Promise<Blob> {
  const { format, quality } = settings
  const mime = MIME[format]
  // Every encode path here starts on a canvas (the WASM one reads its pixels back
  // off one), so a browser without OffscreenCanvas cannot write an image at all.
  // Said as a ConversionError rather than left to `new OffscreenCanvas` throwing a
  // bare ReferenceError, which BatchScheduler.simplifiedErrorReason would put in
  // front of the user verbatim as "OffscreenCanvas is not defined". This is the same
  // condition imageModule.probe() reports, for browsers reached before anything
  // consults the probe.
  if (typeof OffscreenCanvas === 'undefined') {
    throw new ConversionError(
      'unsupported-in-browser',
      'This browser is missing the image APIs this converter needs. Try the latest Chrome, Edge, Firefox, or Safari.',
    )
  }
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new ConversionError(
      'unsupported-in-browser',
      'This browser could not open a canvas to write the image with.',
    )
  }
  // JPEG has no alpha channel, and a fresh 2D canvas is transparent *black* - so
  // drawing a transparent PNG straight onto it and encoding as JPEG turns every
  // see-through region black. Measured on a translucent test image: the transparent
  // band came out rgb(1, 28, 37). Filling an opaque matte first is what every other
  // converter does, and white is the conventional choice. #35 makes the colour a
  // setting; this is the default it will start from.
  if (!SUPPORTS_ALPHA[format]) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, bitmap.width, bitmap.height)
  }
  context.drawImage(bitmap, 0, 0)

  // PNG needs no probe (it is the format canvas always implements) and takes no
  // quality; everything else asks canvas first and falls back to WASM.
  if (format === 'png') return canvas.convertToBlob({ type: mime })

  if (await canvasEncodes(mime as EncodableMime)) {
    // canvas quality is 0-1, the schema's slider is 1-100.
    return canvas.convertToBlob({ type: mime, quality: quality / 100 })
  }

  if (format === 'jpg') {
    // Every browser with OffscreenCanvas encodes JPEG, so reaching this would mean
    // the probe found otherwise - say so instead of silently writing a PNG named
    // .jpg, which is what convertToBlob would do.
    throw new ConversionError(
      'unsupported-in-browser',
      'This browser cannot write JPEG files.',
    )
  }

  const data = context.getImageData(0, 0, bitmap.width, bitmap.height)
  return encodeWithWasm(mime as 'image/webp' | 'image/avif', data, quality)
}

function throwIfCanceled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ConversionError('canceled', 'Conversion was canceled.')
  }
}
