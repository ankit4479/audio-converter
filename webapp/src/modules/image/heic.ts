/**
 * HEIC/HEIF decode (E2.2, issue #32) — the flagship case: an iPhone photo converted
 * without it ever leaving the device.
 *
 * Only ever reached when the browser's own decoder has already failed on bytes that
 * look like a HEIF container (see convert.ts). Safari decodes HEIC natively, so on
 * Safari the ~1.4MB WASM below is never downloaded at all; everywhere else it is
 * fetched the first time someone converts a HEIC and never for anything else.
 *
 * libheif is LGPL-3.0. It is used unmodified and loaded as its own chunk rather than
 * fused into our code, which is what keeps the relinking freedom that license exists
 * to protect; see the attribution in webapp/README.md.
 */
import type {
  HeifDecoder,
  HeifImage,
  LibheifModule,
} from 'libheif-js/libheif-wasm/libheif-bundle.mjs'
import { ConversionError } from '../../engine/convert'

/**
 * ISO-BMFF brands that mean "this is a HEIF-family image". Checked against the file's
 * own `ftyp` box rather than trusting a file extension: the extension is user-supplied
 * (and often wrong, e.g. a JPEG renamed .heic), while the brand is written by whatever
 * produced the file.
 *
 * `mif1`/`msf1` are the generic HEIF brands Android and some cameras write; the `he*`
 * brands are what Apple writes.
 */
const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
  'heif',
])

/** Enough of the front of the file to hold the ftyp box's size, type, and brand. */
const FTYP_PROBE_BYTES = 16

/**
 * True when these bytes are a HEIF-family container. Reads only the first 16 bytes,
 * so this costs nothing next to a decode.
 *
 * ISO-BMFF layout: a 4-byte big-endian box size, the 4-char box type ('ftyp'), then
 * the 4-char major brand.
 */
export async function isHeifContainer(file: Blob): Promise<boolean> {
  if (file.size < FTYP_PROBE_BYTES) return false
  const header = new Uint8Array(await file.slice(0, FTYP_PROBE_BYTES).arrayBuffer())
  const ascii = (start: number) =>
    String.fromCharCode(...header.subarray(start, start + 4))
  if (ascii(4) !== 'ftyp') return false
  return HEIF_BRANDS.has(ascii(8))
}

export interface DecodedHeif {
  readonly data: ImageData
  /** How many images the container held. A live photo or a burst holds several; we
   *  convert the first and the caller says so rather than silently returning one file
   *  for a container the user knows held more. */
  readonly imageCount: number
}

/** Cached across files so a batch of 200 photos downloads and compiles the WASM once,
 *  not 200 times. Holds the promise rather than the module so concurrent jobs in the
 *  same worker share one in-flight load instead of racing two compiles. */
let loading: Promise<LibheifModule> | null = null

function loadLibheif(): Promise<LibheifModule> {
  // The ESM build with the WASM inlined. The alternative (a separate 1.03MB .wasm) is
  // smaller on the wire but makes Emscripten resolve a runtime URL from inside a
  // Worker, which is the fragile part; this build has nothing to resolve. The download
  // only ever happens for a HEIC conversion, so reliability wins.
  //
  // The default export is Emscripten's MODULARIZE factory, so it has to be *called*
  // and awaited - it resolves once the inlined WASM is compiled. Importing without
  // calling fails silently: HeifDecoder is just undefined on the factory, which
  // surfaces as "this HEIC could not be read" for every perfectly good file.
  //
  // A failed load is not cached. The failure here is a network one - the chunk is
  // fetched on demand, so a dropped connection or a deploy that rotated the asset
  // hash makes the import reject - and caching that rejection would fail every
  // remaining HEIC in the batch for a blip the next file would have survived.
  loading ??= import('libheif-js/libheif-wasm/libheif-bundle.mjs')
    .then((module) => module.default())
    .catch((cause: unknown) => {
      loading = null
      throw cause
    })
  return loading
}

/**
 * One decoder for every file rather than one per file. Its `decode()` frees the
 * previous file's container context, and that is the only thing in libheif-js's
 * surface that ever frees one - a fresh HeifDecoder per photo leaks a context holding
 * a WASM-heap copy of the entire file, which a 200-photo batch turns into hundreds of
 * megabytes the JS garbage collector cannot touch, ending in an Emscripten
 * out-of-memory abort partway through.
 *
 * Reuse is what makes the queue below necessary: a second decode() would free the
 * context the first call is still reading images out of.
 */
let decoder: HeifDecoder | null = null

/** Tail of the decode queue. Decodes run one at a time per worker (which is all the
 *  scheduler asks for anyway - one job per engine), so the shared decoder above is
 *  never re-entered. Rejections are swallowed here only so one bad file doesn't
 *  poison the queue for the next; the caller still sees its own rejection. */
let queue: Promise<unknown> = Promise.resolve()

/** Test-only: drops the cached loader and decoder so one test's fake libheif can't
 *  leak into the next, mirroring _resetCanvasSupportForTests and
 *  registry._resetForTests. */
export function _resetLibheifForTests(): void {
  loading = null
  decoder = null
  queue = Promise.resolve()
}

export function decodeHeif(file: Blob): Promise<DecodedHeif> {
  const run = queue.then(() => decodeExclusively(file))
  // Discards the value as well as the rejection. A bare `run.catch(...)` would leave
  // the tail holding the fulfilled DecodedHeif, and with it a full-size ImageData
  // (~48MB for a 12MP photo) alive for the life of the worker - the same leak the
  // bitmap.close() in convert.ts exists to prevent, one link further back.
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function decodeExclusively(file: Blob): Promise<DecodedHeif> {
  const libheif = await loadLibheif()
  // Reading the file can fail on its own: a File whose backing bytes moved or were
  // deleted since intake rejects with a DOMException, which would otherwise reach the
  // batch as a raw "NotFoundError: A requested file or directory could not be found"
  // (simplifiedErrorReason shows an unknown error's message verbatim) instead of this
  // module's per-file message. Same reason convert.ts guards the ftyp sniff.
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch (cause) {
    throw unreadable(cause)
  }

  // Reports unparseable bytes by returning an empty array (it logs and swallows
  // internally); the try is for the throws its Emscripten calls can still raise.
  // Constructing the decoder is inside it too: that allocates in the WASM heap, so it
  // can abort just as decode() can, and an escaping raw Error would reach the batch as
  // a bare "conversion failed" instead of this module's per-file message.
  let images
  try {
    decoder ??= new libheif.HeifDecoder()
    images = decoder.decode(bytes)
  } catch (cause) {
    // An Emscripten abort (out of memory on a 48MP photo) leaves the whole WASM
    // runtime dead, not just this call. Keeping the cached decoder - and the module it
    // came from - would then fail every remaining HEIC in the batch for one bad file.
    // Dropping both makes the next file instantiate a fresh module instead of
    // inheriting the abort; the import itself is already cached, so only the WASM is
    // compiled again, and only after a failure.
    decoder = null
    loading = null
    throw unreadable(cause)
  }
  if (images.length === 0) throw unreadable(new Error('no images in container'))

  try {
    // The primary image. libheif applies the container's own rotation/mirror
    // transforms (irot/imir) while decoding, which is why width and height here are
    // already the orientation a viewer would show - important because canvas output
    // carries no metadata, so an un-applied transform would be dropped rather than
    // merely ignored.
    const image = images[0]
    const data = allocate(image)
    await render(image, data)
    return { data, imageCount: images.length }
  } finally {
    // Every image handle, not just the one converted: each is a WASM-heap allocation
    // the GC cannot see, so skipping the others would leak one per frame of every
    // burst in the batch.
    for (const image of images) image.free()
  }
}

/**
 * The buffer libheif renders into, sized from the handle.
 *
 * Wrapped because the allocation itself can fail on a file the user is entitled to a
 * sentence about: a corrupt container whose handle reports a zero dimension makes
 * ImageData throw IndexSizeError, and a huge one throws RangeError when the pixel
 * array won't fit. Either would escape as a raw browser error, which
 * BatchScheduler.simplifiedErrorReason puts in front of the user verbatim.
 */
function allocate(image: HeifImage): ImageData {
  try {
    return new ImageData(image.get_width(), image.get_height())
  } catch (cause) {
    throw unreadable(cause)
  }
}

/**
 * Awaits one image's pixels landing in `data`.
 *
 * The uncaught-error listener is the load-bearing part. libheif's `display()` does
 * its work inside a `setTimeout` callback, so anything it throws there - an
 * Emscripten out-of-memory abort, or the RangeError from `data.set()` when a decoded
 * plane turns out wider than the handle said - escapes into the timer instead of this
 * promise. Its callback then never runs, the promise never settles, and the job sits
 * at "running" forever holding a worker slot: the batch can never finish and the user
 * is left with a progress bar that stops. Catching the uncaught error turns that hang
 * into an ordinary per-file failure the batch reports and moves past.
 */
function render(
  image: { display: (target: ImageData, done: (result: unknown) => void) => void },
  data: ImageData,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onUncaught = (event: ErrorEvent) => {
      finish()
      reject(unreadable(event.error ?? new Error(event.message)))
    }
    const finish = () => {
      globalThis.removeEventListener('error', onUncaught)
    }
    globalThis.addEventListener('error', onUncaught)
    try {
      image.display(data, (result) => {
        finish()
        // libheif reports failure by handing back nothing rather than throwing.
        if (!result) reject(unreadable(new Error('libheif could not render the image')))
        else resolve()
      })
    } catch (cause) {
      // display() can also throw before it ever reaches its timer (a bad handle). The
      // promise would reject on its own, but the listener would stay attached for the
      // life of the worker - one more per failed file, each still holding this
      // already-settled promise's reject.
      finish()
      reject(unreadable(cause))
    }
  })
}

function unreadable(cause: unknown): ConversionError {
  return new ConversionError(
    'unreadable',
    // Deliberately not "this HEIC": the same decoder handles .heif, and telling
    // someone their HEIF file is a broken HEIC is just wrong.
    'This photo could not be read. It may be corrupted, or use a variant this decoder does not support.',
    { cause },
  )
}
