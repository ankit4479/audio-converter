/**
 * Raster to SVG tracing (E2.4, issue #34).
 *
 * Not an encode: producing SVG means finding regions in the bitmap and fitting paths to
 * their boundaries, which no browser API does. So this is the one target that leaves the
 * canvas pipeline entirely - pixels in, markup out.
 *
 * Positioned as vectorizing flat artwork. Tracing a photograph produces a valid SVG that
 * is bigger than the source, slower to draw, and worse-looking; the honest answer for a
 * photo is "don't", so an input that looks photographic gets told so on its own row
 * rather than quietly receiving junk.
 *
 * imagetracerjs is public domain (Unlicense) and pure JavaScript - no WASM to load, and
 * its own module wrapper has an explicit worker branch. See #34 for why potrace (GPL)
 * and vtracer (Node-only npm build) were both rejected.
 */
import { ConversionError } from '../../engine/convert'

/** How many colours the tracer reduces the image to before fitting paths. Fewer means
 *  flatter, smaller output; the point of the control is that flat artwork wants very
 *  few. */
export type TraceColors = '2' | '4' | '8' | '16'

export interface TraceSettings {
  /** Palette size. */
  traceColors: TraceColors
  /** Drops paths shorter than this, which is what removes speckle from a slightly
   *  noisy scan. imagetracerjs calls it `pathomit`. */
  traceDespeckle: number
  /** How aggressively straight and curved runs are simplified (imagetracerjs's
   *  `ltres`/`qtres`). Higher is smoother and smaller, at the cost of fidelity. */
  traceSmoothing: number
}

export interface TracedSvg {
  readonly svg: string
  /** Present when the input looks photographic - see looksPhotographic(). */
  readonly note?: string
}

/**
 * Colour count past which an image is treated as photographic.
 *
 * Chosen from what the two cases actually look like: flat artwork is a handful of fills
 * plus antialiasing along the edges, while a photograph has a distinct colour almost
 * everywhere. Measured on the samples in this repo's own tests, a two-tone logo lands in
 * the tens even with antialiasing, and a gradient photo in the thousands, so anywhere in
 * between separates them - this is not a value that needs tuning to be useful.
 */
const PHOTOGRAPHIC_COLORS = 512

/** Colour bits kept per channel when counting. 4 bits (4096 buckets) is coarse enough
 *  that JPEG noise doesn't inflate the count and fine enough to separate real fills. */
const COLOR_BITS = 4

/** At most this many pixels are sampled for the heuristic, so the cost does not grow
 *  with the image. */
const SAMPLE_BUDGET = 20_000

let loading: Promise<ImageTracer> | null = null

function loadTracer(): Promise<ImageTracer> {
  // Lazily imported so a conversion that is not to SVG never pays for it, the same
  // reasoning the WASM encoders and the HEIC decoder follow. Cleared on failure so one
  // bad fetch doesn't condemn the rest of a batch.
  loading ??= import('imagetracerjs').then(
    (module) => (module.default ?? module) as ImageTracer,
    (cause) => {
      loading = null
      throw new ConversionError(
        'unknown',
        'The tracer could not be loaded. Check your connection and try again.',
        { cause },
      )
    },
  )
  return loading
}

/** Test-only: drops the cached loader so one test's fake tracer can't leak into the
 *  next, mirroring _resetLibheifForTests. */
export function _resetTracerForTests(): void {
  loading = null
}

interface ImageTracer {
  imagedataToSVG(
    data: { width: number; height: number; data: Uint8ClampedArray },
    options?: Record<string, unknown>,
  ): string
}

export async function traceToSvg(
  pixels: ImageData,
  settings: TraceSettings,
): Promise<TracedSvg> {
  const tracer = await loadTracer()

  let svg: string
  try {
    svg = tracer.imagedataToSVG(
      { width: pixels.width, height: pixels.height, data: pixels.data },
      {
        numberofcolors: Number(settings.traceColors),
        pathomit: settings.traceDespeckle,
        ltres: settings.traceSmoothing,
        qtres: settings.traceSmoothing,
        // Off: blurring before tracing loses the crisp edges that are the whole reason
        // to vectorize flat artwork.
        blurradius: 0,
      },
    )
  } catch (cause) {
    throw new ConversionError('unknown', 'This image could not be traced.', { cause })
  }

  // A tracer that returns markup with no paths has found nothing to draw - a blank or
  // single-colour input. Saying so beats handing over an empty picture.
  if (!svg.includes('<path')) {
    throw new ConversionError(
      'unknown',
      'Nothing was found to trace in this image. It may be blank or a single flat colour.',
    )
  }

  return {
    svg,
    note: looksPhotographic(pixels)
      ? 'This looks like a photo. Tracing works on flat logos and line art; a photo traces poorly and the SVG will usually be larger than the original.'
      : undefined,
  }
}

/**
 * Whether the image has too many distinct colours to be flat artwork.
 *
 * Deliberately a colour count rather than anything cleverer: it is one pass over a
 * bounded sample, it needs no tuning to separate the two cases (see
 * PHOTOGRAPHIC_COLORS), and being wrong only changes whether an advisory note appears.
 */
export function looksPhotographic(pixels: ImageData): boolean {
  const { data, width, height } = pixels
  const total = width * height
  // Sample evenly rather than taking a corner: a photo with a plain sky would look flat
  // from its top-left alone.
  const step = Math.max(1, Math.floor(total / SAMPLE_BUDGET))
  const shift = 8 - COLOR_BITS
  const seen = new Set<number>()

  for (let index = 0; index < total; index += step) {
    const offset = index * 4
    // Fully transparent pixels have no colour to speak of, and counting them would make
    // any icon with a transparent background look busier than it is.
    if (data[offset + 3] < 8) continue
    const key =
      ((data[offset] >> shift) << (COLOR_BITS * 2)) |
      ((data[offset + 1] >> shift) << COLOR_BITS) |
      (data[offset + 2] >> shift)
    seen.add(key)
    // No point counting further once the answer cannot change.
    if (seen.size > PHOTOGRAPHIC_COLORS) return true
  }
  return false
}
