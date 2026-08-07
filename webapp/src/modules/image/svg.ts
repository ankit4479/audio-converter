/**
 * SVG rasterization (E2.3, issue #33).
 *
 * The one part of the image module that cannot run in the worker. `createImageBitmap`
 * does not accept SVG at all - not in a worker and not on the main thread either
 * (verified: it throws `InvalidStateError: The source image could not be decoded`) -
 * and the only thing that does render SVG is an `Image` fed a blob URL, which needs
 * DOM APIs a worker does not have. So this runs on the main thread, hands the worker a
 * transferable ImageBitmap, and everything after the decode stays the shared path.
 *
 * No new dependency: the browser already has a complete SVG renderer.
 */
import { ConversionError } from '../../engine/convert'

/**
 * Fallback size for an SVG that declares neither width/height nor a viewBox, which is
 * legal but leaves nothing to derive a pixel size from. 512 is a common icon export
 * size and large enough to be useful; the alternative (refusing the file) would be
 * worse for something the browser can render perfectly well.
 */
const DEFAULT_SIZE = 512

/** Guards against an SVG whose declared size, times the scale, would allocate an
 *  absurd canvas. 16384 is the smallest max canvas dimension across the browsers this
 *  app supports, so beyond it the canvas silently fails rather than throwing. */
const MAX_DIMENSION = 16384

/**
 * Cap on total pixels, not just on each side.
 *
 * Per-side limits are not the binding constraint everywhere: iOS Safari caps canvas
 * *area* at roughly 16.7M pixels, so a 16384x8192 render (134M px) passes the per-side
 * check and then produces a blank image, because a canvas that big fails by clipping
 * rather than by throwing. A blank output is the one failure mode this feature must not
 * have, so the render is scaled to fit and the user is told it was - rather than
 * silently getting either nothing or a downgrade they did not ask for.
 *
 * 16.7M px is ~4096x4096 square, or ~5793x2896 at 2:1. Beyond it a browser that can
 * allocate the bitmap at all is usually already refusing the ~1GB of RGBA involved.
 */
const MAX_AREA = 16_777_216

/** Enough of the front of the file to find the root tag past a declaration, a comment,
 *  or a doctype. Generous rather than tight because a sniff that stops short of the root
 *  tag sends a perfectly good SVG to the worker to fail as "could not be read": an
 *  Illustrator doctype with an internal entity subset (ns_extend, ns_ai, ns_graphs and
 *  friends) runs past a kilobyte on its own, and icon-set exports routinely open with a
 *  multi-kilobyte licence comment ahead of that. 64KB of text is a cheap read even for
 *  the non-SVG files this also runs on. */
const SNIFF_BYTES = 65536

/**
 * True when these bytes are SVG. Sniffed from the content rather than the file name or
 * the `type` a File picked up from disk (often empty), for the same reason the HEIC
 * path checks the ftyp brand: what the file *is* beats what it is called.
 */
export async function isSvg(file: Blob): Promise<boolean> {
  const head = await file.slice(0, SNIFF_BYTES).text()
  // The optional prefix matches a namespaced root (`<svg:svg`), which Inkscape and
  // other editors emit and which is just as valid as the unprefixed spelling.
  return /<(?:[A-Za-z_][\w.-]*:)?svg[\s>/]/i.test(head)
}

export interface RasterizedSvg {
  readonly bitmap: ImageBitmap
  readonly width: number
  readonly height: number
  /** Set when the requested scale had to be reduced to stay inside what a canvas can
   *  actually draw. Shown on that file's row, because a smaller render than asked for
   *  is exactly the kind of thing that must not happen quietly. */
  readonly note?: string
}

/**
 * Renders an SVG at `scale` times its own size.
 *
 * The size is written onto the SVG root *before* the Image loads it, so the browser
 * rasterizes the vector at the target size. Loading at the intrinsic size and then
 * drawing bigger would upscale a raster the browser had already produced, which is
 * exactly the blurry result a vector source is supposed to avoid.
 */
export async function rasterizeSvg(file: Blob, scale: number): Promise<RasterizedSvg> {
  const source = await readText(file)
  // The scale arrives as a settings value (a string from a select, see ImageSettings),
  // so a shape that predates the field - or any caller that leaves it out - would
  // otherwise put NaN into the markup's width and render nothing at all.
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1
  const { markup, width, height, reduced } = resize(source, factor)

  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    const image = await loadImage(url)
    // The Image is already rasterized at the target size by the markup's own
    // width/height, so this is a straight handoff, not a resample.
    return {
      bitmap: await toBitmap(image),
      width,
      height,
      note: reduced
        ? // Says what happened rather than blaming the request: the limits bite at 1x too,
          // for a vector whose own declared size is already past what a canvas can draw,
          // and "a larger render was asked for" would be untrue there.
          `Rendered at ${width}x${height}, the largest a browser canvas can draw at this shape.`
        : undefined,
    }
  } finally {
    // Every path, including the failures: a leaked blob URL pins the whole SVG in
    // memory for the life of the document.
    URL.revokeObjectURL(url)
  }
}

async function readText(file: Blob): Promise<string> {
  try {
    return await file.text()
  } catch (cause) {
    throw invalid('This SVG could not be read.', cause)
  }
}

/**
 * Parses the SVG, resolves what size it is asking to be, and writes the scaled size
 * back onto the root.
 *
 * Parsing rather than string-munging is what catches a malformed file: an `Image`
 * given broken SVG fails with a bare `onerror` carrying no reason, so without this the
 * user would get "could not be read" for a file whose actual problem is a typo on line
 * 12 - or worse, a blank image.
 */
function resize(
  source: string,
  scale: number,
): { markup: string; width: number; height: number; reduced: boolean } {
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  // DOMParser reports XML errors by putting a <parsererror> in the result rather than
  // throwing, so this is the check, not a belt-and-braces extra.
  const failure = document.querySelector('parsererror')
  if (failure) {
    throw invalid(
      'This SVG could not be parsed. It may be malformed or incomplete.',
      new Error(failure.textContent ?? 'parsererror'),
    )
  }

  const root = document.documentElement
  // localName, not tagName: a namespaced root (`<svg:svg>`, which Inkscape writes) is
  // a real SVG and tagName would spell it "svg:svg" and reject the file.
  if (root.localName !== 'svg') {
    throw invalid(
      'This file is not an SVG - its root element is not <svg>.',
      new Error(`root element was <${root.tagName}>`),
    )
  }

  const intrinsic = intrinsicSize(root)
  const { width, height, reduced } = fit(
    intrinsic.width * scale,
    intrinsic.height * scale,
  )

  // Without a viewBox, width/height only size the *viewport*: user units still map 1:1,
  // so a scaled-up viewport pads the drawing out with empty space instead of rendering
  // it larger - a 2x request on a plain `<svg width="100" height="50">` would return a
  // 200x100 image with the artwork still 100x50 in the corner. Giving the root the
  // viewBox its own intrinsic size implies is what turns the pixel dimensions below
  // into an actual scale factor. Where a viewBox already exists it is left alone: it is
  // the drawing's own coordinate system and scaling is already relative to it.
  if (!viewBoxSize(root)) {
    root.setAttribute('viewBox', `0 0 ${intrinsic.width} ${intrinsic.height}`)
  }
  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))
  // width/height on <svg> are CSS geometry properties, so *any* CSS declaration for them
  // beats the attributes above and would render the vector at its own size however large
  // a scale was asked for: an inline `style="width:24px"` (which several editors write,
  // and which every "responsive SVG" snippet on the web sets to 100%), and equally a
  // `<style>svg { width: 100% }</style>` inside the document, which dropping the inline
  // declarations would not have touched. Restating the size as an !important inline
  // declaration is what wins over both. The rest of the root's styling (fill, stroke,
  // transforms) is left alone.
  root.style?.setProperty('width', `${width}px`, 'important')
  root.style?.setProperty('height', `${height}px`, 'important')
  return {
    markup: new XMLSerializer().serializeToString(document),
    width,
    height,
    reduced,
  }
}

/**
 * What size the SVG is asking to be, in pixels.
 *
 * Prefers explicit width/height, falls back to the viewBox's dimensions (very common
 * in exported icons, which often carry only a viewBox), then to a default. Percentage
 * and unit-suffixed values are treated as absent: they are relative to a container
 * this file has none of.
 */
function intrinsicSize(root: Element): { width: number; height: number } {
  const width = lengthAttribute(root, 'width')
  const height = lengthAttribute(root, 'height')
  if (width !== undefined && height !== undefined) return { width, height }

  const box = viewBoxSize(root)
  if (box) {
    // One dimension given and the other not is legal; the viewBox's aspect ratio
    // fills in the missing one.
    if (width !== undefined) return { width, height: (width * box.height) / box.width }
    if (height !== undefined) return { width: (height * box.width) / box.height, height }
    return box
  }

  // No viewBox, so there is no aspect ratio to complete a missing side from. The side
  // that *was* given stands in for the one that wasn't: `<svg width="100">` is legal and
  // squaring it off beats pairing a 100px width with DEFAULT_SIZE, which would render
  // the drawing into the top 100px of a 512px-tall canvas and call the rest of it image.
  const given = width ?? height ?? DEFAULT_SIZE
  return { width: width ?? given, height: height ?? given }
}

/**
 * The absolute CSS units SVG allows on width/height, in px.
 *
 * Relative units are deliberately absent (%, em, ex, rem): they resolve against a
 * container or a font this file has none of. The absolute ones are here because
 * Inkscape writes `width="210mm" height="297mm"` for an A4 document, and treating that
 * as unresolvable falls through to the viewBox - whose user units are 210x297 for the
 * same file, so an A4 page rasterized to a 210x297 postage stamp at 1x.
 */
const UNITS_IN_PX: Readonly<Record<string, number>> = {
  '': 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
}

/** A pixel length off the root, or undefined where it is absent or unresolvable. */
function lengthAttribute(root: Element, name: string): number | undefined {
  const raw = root.getAttribute(name)
  if (raw === null) return undefined
  // parseFloat would happily read "100%" as 100 and "10em" as 10, both of which mean
  // something this file cannot resolve; anything not in UNITS_IN_PX fails to match and
  // is treated as absent.
  const match = /^(\d+(?:\.\d+)?)(px|pt|pc|in|cm|mm|q)?$/i.exec(raw.trim())
  if (!match) return undefined
  const value = Number.parseFloat(match[1]) * UNITS_IN_PX[(match[2] ?? '').toLowerCase()]
  return value > 0 ? value : undefined
}

/** The viewBox's own width/height, or undefined when there is no usable one. Shared by
 *  the sizing above and resize()'s decision about whether it has to supply one. */
function viewBoxSize(root: Element): { width: number; height: number } | undefined {
  const parts = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  if (parts?.length !== 4 || !parts.every(Number.isFinite)) return undefined
  const [, , width, height] = parts
  return width > 0 && height > 0 ? { width, height } : undefined
}

/**
 * Brings a requested render inside both MAX_DIMENSION and MAX_AREA, scaling both sides
 * by the *same*
 * factor. Clamping each side on its own would have distorted anything long and thin: a
 * 8000x4000 source at 4x wants 32000x16000, and capping only the width would have
 * rendered it 16384x16000 - a 2:1 drawing squashed to almost square.
 */
function fit(
  width: number,
  height: number,
): { width: number; height: number; reduced: boolean } {
  const bySide = MAX_DIMENSION / Math.max(width, height)
  // sqrt because area scales with the square of a linear factor.
  const byArea = Math.sqrt(MAX_AREA / (width * height))
  const factor = Math.min(1, bySide, byArea)
  return {
    width: atLeastOnePixel(width * factor),
    height: atLeastOnePixel(height * factor),
    // Rounding can shave a pixel off without the request having been unreasonable, so
    // "reduced" means the limits actually bit, not merely that a number changed.
    reduced: factor < 1,
  }
}

function atLeastOnePixel(value: number): number {
  return Math.max(1, Math.round(value))
}

/**
 * The rendered Image, handed over as the transferable the worker takes.
 *
 * Wrapped because this is where the pixels are actually allocated, and the browser can
 * refuse: MAX_DIMENSION caps each side but not the total, so a 4000x4000 vector at 4x
 * asks for 16384x16384 - about a gigabyte of RGBA - and `createImageBitmap` rejects with
 * a bare DOMException. Unwrapped that escapes ImageEngine.prepare() and BatchScheduler
 * shows it to the user verbatim, instead of the wording the batch shows for every other
 * failure in
 * this module produces.
 */
async function toBitmap(image: HTMLImageElement): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(image)
  } catch (cause) {
    throw invalid(
      'This SVG was too large to render at the size requested. Try a smaller size.',
      cause,
    )
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    // onerror carries no useful detail, which is why the parse above does the real
    // diagnosis. Anything reaching here parsed as XML but still would not render -
    // an external reference the sandbox blocks, for instance.
    image.onerror = () =>
      reject(invalid('This SVG could not be rendered.', new Error('image load failed')))
    image.src = url
  })
}

function invalid(message: string, cause: unknown): ConversionError {
  return new ConversionError('unreadable', message, { cause })
}
