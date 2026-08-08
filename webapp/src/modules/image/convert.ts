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
import type { ImageFormatId, ImageOutputFormatId } from '../../platform/graph'
import { canvasEncodes, encodeWithWasm, type EncodableMime } from './encoders'
import { traceToSvg, type TraceSettings } from './trace'
import { decodeHeif, isHeifContainer } from './heic'

export type { ImageFormatId }

/** How many times the vector's own size to render at. A string because that is what
 *  SettingField's `select` carries, and the settings object mirrors the schema rather
 *  than quietly diverging from it. */
export type SvgScale = '1' | '2' | '3' | '4'

/** A cap on the output's longer side, or 'original' for none (E2.5, issue #35). A
 *  fixed preset list rather than free-form width/height: it can never distort the
 *  aspect ratio (there is only one number to honor, not two to reconcile), and there
 *  is no NaN/negative/absurd-value story to validate - the same reasoning
 *  MAX_DIMENSION/MAX_AREA in svg.ts already uses for the same class of problem. Only
 *  meaningful for a raster target; hidden entirely for SVG (see the schema). */
export type ResizeOption = 'original' | '3840' | '1920' | '1280' | '640'

export interface ImageSettings extends TraceSettings {
  /** Output format. Named `format` rather than `codec` because there is no codec
   *  table here - the browser is the codec. `svg` is produced by tracing rather than
   *  encoding (E2.4, issue #34). See ConverterModule.targetSettingKey. */
  format: ImageOutputFormatId
  /** 1-100 for the lossy formats. Ignored for PNG, which is lossless. */
  quality: number
  /** Only used for a vector source, which has no pixel size of its own (E2.3, #33). */
  scale: SvgScale
  /** See ResizeOption. Ignored for an SVG target. */
  resize: ResizeOption
  /** Matte painted under a target that drops alpha (today, only JPEG) before the
   *  source is drawn - a fresh 2D canvas is transparent *black*, not white, so
   *  without this every see-through region of a transparent source would encode as
   *  near-black. Was a hardcoded '#ffffff'; this is that same default, now a
   *  setting. */
  backgroundColor: string
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

/** Shared by the two places a decode can fail, so both say the same thing. */
const UNREADABLE_MESSAGE =
  'This image could not be read. It may be corrupted, or in a format this browser cannot open.'

const EXTENSION: Record<ImageFormatId, string> = {
  png: 'png',
  jpg: 'jpg',
  webp: 'webp',
  avif: 'avif',
}

/**
 * The bytes to convert, or - for an SVG - the bitmap the main thread already rasterized
 * from them. SVG cannot be decoded here: `createImageBitmap` does not accept it and the
 * only thing that renders it needs DOM APIs a worker has none of (see svg.ts). The
 * bitmap arrives transferred rather than copied, so encoding still happens off the main
 * thread.
 */
export type ImageSource = Blob | ImageBitmap

export async function convertImage(
  file: ImageSource,
  baseName: string,
  settings: ImageSettings,
  options: {
    onProgress?: (progress: ConvertProgress) => void
    signal?: AbortSignal
  } = {},
): Promise<ConvertResult> {
  const { signal, onProgress } = options
  // An SVG arrives as a bitmap transferred in from the main thread, so this side owns
  // those pixels the moment the call lands: throwing here without closing it leaks them
  // for the life of the worker, since the `finally` that frees them on every other path
  // is not entered yet and the main thread no longer has a handle to close.
  if (signal?.aborted && !(file instanceof Blob)) file.close()
  throwIfCanceled(signal)

  const { bitmap, note } = await decode(file)

  // Everything after the decode runs inside the try, including the cancellation
  // check: a batch cancelled while this file was decoding would otherwise throw
  // before the `finally` existed and leak the bitmap it just paid for - ~48MB per
  // cancelled 12MP photo, which is the leak the close() below exists to prevent.
  try {
    throwIfCanceled(signal)

    // SVG leaves the canvas pipeline entirely: there is nothing to encode, only regions
    // to find and paths to fit. Every decoder above still applies, so this gets the same
    // pixels any other target would.
    // Captured before the check so TypeScript narrows it to the raster formats below.
    const format = settings.format
    if (format === 'svg') {
      const traced = await traceToSvg(pixelsOf(bitmap), settings)
      throwIfCanceled(signal)
      onProgress?.({ fraction: 1, processedSeconds: 0 })
      return {
        blob: new Blob([traced.svg], { type: 'image/svg+xml' }),
        fileName: `${baseName}.svg`,
        // A trace note (this looks like a photo) is about the same file as a decode note
        // (this HEIC held several images) and both are worth saying, but the row shows
        // one; the trace note is the more actionable of the two.
        note: traced.note ?? note,
      }
    }
    // Decode is the slow half for a large photo and there is no sub-step to report
    // from inside it, so progress is reported at the one honest boundary rather than
    // faked as a smooth ramp. processedSeconds is 0 throughout: it is the audio
    // engine's own unit (seconds of input consumed) and an image has no duration, so
    // reporting anything else would be inventing a number.
    onProgress?.({ fraction: 0.5, processedSeconds: 0 })

    const blob = await encode(bitmap, format, settings)
    throwIfCanceled(signal)
    onProgress?.({ fraction: 1, processedSeconds: 0 })
    return { blob, fileName: `${baseName}.${EXTENSION[format]}`, note }
  } finally {
    // Frees the decoded pixels immediately rather than waiting for GC - a batch of
    // 12MP photos holds ~48MB each otherwise.
    bitmap.close()
  }
}

interface Decoded {
  readonly bitmap: ImageBitmap
  readonly note?: string
}

async function decode(file: ImageSource): Promise<Decoded> {
  // Already rasterized on the main thread, which is the only place SVG can be.
  if (!(file instanceof Blob)) return { bitmap: file }

  try {
    // imageOrientation is stated rather than left to the default: the spec's default
    // became 'from-image' only in 2021, and engines that still default to 'none'
    // hand back the raw pixels of an EXIF-rotated photo (every phone camera writes
    // one). Canvas output carries no EXIF, so the rotation isn't merely ignored -
    // it is dropped, and a portrait photo is written permanently sideways.
    return { bitmap: await createImageBitmap(file, { imageOrientation: 'from-image' }) }
  } catch (cause) {
    // The browser's own decoder is always tried first, for every format. Safari can
    // read HEIC natively (and applies the orientation itself), so there the WASM
    // decoder below never loads at all. Only bytes that are genuinely a HEIF
    // container are worth a ~1.4MB download - checked against the file's own ftyp
    // brand, not its extension, so a JPEG renamed .heic fails fast instead.
    // `.catch(() => false)` because the sniff reads the file: a File whose backing
    // bytes have moved or been deleted since intake rejects with a DOMException, and
    // that would otherwise escape this catch block as a raw browser error instead of
    // the per-file ConversionError below.
    if (await isHeifContainer(file).catch(() => false)) return decodeWithLibheif(file)

    // Everything else reaching here is "the browser could not decode this": a corrupt
    // file, or a format it has no decoder for (an AVIF on an older browser). Both
    // are per-file failures the batch reports, not reasons to stop.
    throw new ConversionError('unreadable', UNREADABLE_MESSAGE, { cause })
  }
}

async function decodeWithLibheif(file: Blob): Promise<Decoded> {
  const { data, imageCount } = await decodeHeif(file)
  // ImageData in, ImageBitmap out, so everything downstream - the matte, the canvas,
  // the encoders, the close() that frees the pixels - stays one code path regardless of
  // which decoder produced them.
  //
  // This runs inside decode()'s catch block, so its own try no longer covers it: a
  // failure here (the browser refusing to allocate a second full-size copy of a 48MP
  // photo) would escape as a raw DOMException, which BatchScheduler shows the user
  // verbatim instead of the wording the batch shows for a decode failure. (That
  // wording is currently REASON_MESSAGE's fixed string for the reason, not this
  // module's own message - see #36.)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(data)
  } catch (cause) {
    throw new ConversionError('unreadable', UNREADABLE_MESSAGE, { cause })
  }
  return {
    bitmap,
    note:
      imageCount > 1
        ? `This file held ${imageCount} images. The main one was converted; the others were left out.`
        : undefined,
  }
}

/**
 * Opens a canvas and its 2D context, reporting both ways that can fail as typed per-file
 * errors rather than raw browser exceptions.
 *
 * Every path in this module needs pixels on a canvas: the encoders write from one, the
 * WASM encoders read their pixels back off one, and the tracer needs the ImageData only
 * a canvas can produce. Said as ConversionErrors because
 * BatchScheduler.simplifiedErrorReason puts anything else in front of the user verbatim
 * - a bare `new OffscreenCanvas` would read as "OffscreenCanvas is not defined". This is
 * the same condition imageModule.probe() reports, for browsers reached before anything
 * consults the probe.
 */
function openCanvas(
  width: number,
  height: number,
): { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D } {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new ConversionError(
      'unsupported-in-browser',
      'This browser is missing the image APIs this converter needs. Try the latest Chrome, Edge, Firefox, or Safari.',
    )
  }
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new ConversionError(
      'unsupported-in-browser',
      'This browser could not open a canvas to write the image with.',
    )
  }
  return { canvas, context }
}

/** The decoded pixels, which the tracer needs and a canvas is the only way to get. */
function pixelsOf(bitmap: ImageBitmap): ImageData {
  const { context } = openCanvas(bitmap.width, bitmap.height)
  context.drawImage(bitmap, 0, 0)
  return context.getImageData(0, 0, bitmap.width, bitmap.height)
}

/** The output's actual dimensions once `resize` is applied: capped to the chosen
 *  preset's longer side, aspect ratio preserved by construction (one number scales
 *  both sides by the same factor), never upscaled (a preset bigger than the source
 *  is a no-op, not an invitation to blow a small image up). */
function fitToResize(
  width: number,
  height: number,
  resize: ResizeOption,
): { width: number; height: number } {
  if (resize === 'original') return { width, height }
  const max = Number(resize)
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const factor = max / longest
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  }
}

async function encode(
  bitmap: ImageBitmap,
  // Narrowed to the raster formats: the SVG target returns from convertImage before
  // reaching here, which is what keeps MIME/EXTENSION/SUPPORTS_ALPHA exhaustive over
  // exactly the formats a canvas can write.
  format: ImageFormatId,
  settings: ImageSettings,
): Promise<Blob> {
  const { quality, resize, backgroundColor } = settings
  const mime = MIME[format]
  // The canvas is opened at the *resized* dimensions, not the bitmap's own - drawImage
  // below then does the actual scaling as part of the same draw that copies the pixels
  // in, rather than a separate resample pass.
  const { width, height } = fitToResize(bitmap.width, bitmap.height, resize)
  const { canvas, context } = openCanvas(width, height)
  // JPEG has no alpha channel, and a fresh 2D canvas is transparent *black* - so
  // drawing a transparent PNG straight onto it and encoding as JPEG turns every
  // see-through region black. Measured on a translucent test image: the transparent
  // band came out rgb(1, 28, 37). Filling an opaque matte first is what every other
  // converter does; backgroundColor is that matte, defaulting to white.
  if (!SUPPORTS_ALPHA[format]) {
    context.fillStyle = backgroundColor
    context.fillRect(0, 0, width, height)
  }
  context.drawImage(bitmap, 0, 0, width, height)

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

  const data = context.getImageData(0, 0, width, height)
  return encodeWithWasm(mime as 'image/webp' | 'image/avif', data, quality)
}

function throwIfCanceled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ConversionError('canceled', 'Conversion was canceled.')
  }
}
