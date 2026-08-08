/**
 * The image module (E2.1, issue #31): the platform's first non-audio module, and the
 * thing that proves the ConverterModule abstraction was real rather than a shape
 * fitted around one implementation.
 *
 * Deliberately mirrors modules/audio/index.ts: declare the module, defer all work to
 * an engine loaded behind a dynamic import. Nothing here imports React or the DOM
 * beyond the types, so it stays worker-safe.
 */
import * as Comlink from 'comlink'
// The one value import: ConversionError, so an aborted job rejects with the same
// encoded reason the audio engine uses (batchScheduler decodes it into the job's
// message). engine/convert.ts's Mediabunny imports are side-effect-free and drop out
// of this chunk - verified in the built output, where the image worker carries the
// error class and none of Mediabunny.
import {
  ConversionError,
  decodeConversionError,
  isEncodedConversionError,
} from '../../engine/convert'
import {
  formatNode,
  IMAGE_INPUT_FORMAT_IDS,
  IMAGE_OUTPUT_FORMAT_IDS,
} from '../../platform/graph'
import type {
  CapabilityReport,
  ConverterEngine,
  ConverterModule,
  ConvertProgress,
  ConvertResult,
  FileMeta,
  SettingField,
} from '../../platform/module'
import type { ImageSettings, ImageSource } from './convert'
import { isSvg, rasterizeSvg } from './svg'

/** Input extensions this module accepts. Broader than the graph's output formats:
 *  `jpeg` is the same format as `jpg` under another name, and `heic`/`heif` (E2.2,
 *  issue #32) and `svg` (E2.3, issue #33) are read but never written. */
const INPUT_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'avif',
  'heic',
  'heif',
  'svg',
] as const

/** Straight from the graph (the same way modules/audio takes AUDIO_ENCODABLE_TARGETS
 *  from there) rather than a second hand-written list: every image format is both a
 *  source and a target, so the graph's node set *is* this module's input and output
 *  set, and a copy could only ever drift from it. */

/** WebP as the default target: it is the format that is both broadly supported and
 *  materially smaller than the PNG or JPEG most people arrive with, which is the
 *  same reasoning behind the audio module defaulting to MP3. */
const DEFAULT_SETTINGS: ImageSettings = {
  format: 'webp',
  quality: 80,
  // 1x: a vector's own declared size is what its author intended, so anything else
  // has to be asked for.
  scale: '1',
  // Tracing defaults aimed at flat artwork, which is what tracing is for: few colours,
  // a little speckle removal, a little smoothing.
  traceColors: '8',
  traceDespeckle: 8,
  traceSmoothing: 1,
}

/**
 * Quality is the one knob this issue ships. The resize and background-colour fields,
 * and making quality conditional on the target being lossy, are #35 - which is also
 * where the schema stops being a flat list. `format` is in the schema because it is
 * part of the settings shape, but the shell renders it as the URL-synced "Convert to"
 * control rather than an ordinary field (see platform/ModuleSettings).
 */
const SETTINGS_SCHEMA: readonly SettingField[] = [
  {
    kind: 'select',
    key: 'format',
    label: 'Format',
    // Labels come from the graph's own nodes, not from id.toUpperCase(): that
    // spelled 'jpg' as "JPG" and 'webp' as "WEBP" while every other surface in the
    // app (the "Convert to" control, the h1, the mega-menu, Cmd+K) calls them
    // "JPEG" and "WebP", because those all read formatNode().label.
    options: IMAGE_OUTPUT_FORMAT_IDS.map((id) => ({
      value: id,
      label: formatNode(id)?.label ?? id.toUpperCase(),
    })),
  },
  {
    kind: 'slider',
    key: 'quality',
    label: 'Quality',
    min: 1,
    max: 100,
    step: 1,
  },
  // Only meaningful for a vector source, which has no pixel size of its own (E2.3,
  // issue #33). It shows on raster pages too for now, where it does nothing; making
  // fields conditional on the source and target is #35's work, alongside the same
  // treatment for the quality slider above.
  // Only meaningful when the target is SVG. Conditional visibility is #35's work.
  {
    kind: 'select',
    key: 'traceColors',
    label: 'Colours (tracing)',
    options: [
      { value: '2', label: '2' },
      { value: '4', label: '4' },
      { value: '8', label: '8' },
      { value: '16', label: '16' },
    ],
  },
  {
    kind: 'slider',
    key: 'traceDespeckle',
    label: 'Despeckle (tracing)',
    min: 0,
    max: 32,
    step: 1,
  },
  {
    kind: 'slider',
    key: 'traceSmoothing',
    label: 'Smoothing (tracing)',
    min: 0,
    max: 4,
    step: 1,
  },
  {
    kind: 'select',
    key: 'scale',
    label: 'Size (vector sources)',
    options: [
      { value: '1', label: '1x' },
      { value: '2', label: '2x' },
      { value: '3', label: '3x' },
      { value: '4', label: '4x' },
    ],
  },
]

function extensionOf(name: string): string {
  const lastDot = name.lastIndexOf('.')
  return lastDot <= 0 ? '' : name.slice(lastDot + 1).toLowerCase()
}

async function probe(): Promise<CapabilityReport> {
  // Both halves of the pipeline are hard requirements: createImageBitmap is the only
  // decoder, and OffscreenCanvas is where every encode path starts (even the WASM one,
  // which reads its pixels back off a canvas). A browser missing either cannot convert
  // an image at all, and saying so up front beats failing inside a worker per file.
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    return {
      supported: false,
      reason:
        'This browser is missing the image APIs this converter needs. Try the latest Chrome, Edge, Firefox, or Safari.',
    }
  }
  return { supported: true }
}

/** Main-thread half of the engine: owns one worker, wraps it with Comlink, and
 *  presents the plain ConverterEngine the scheduler drives. The audio module's
 *  engine/converter.ts does the same job for audio; this is small enough to live
 *  inline rather than in a file of its own. */
class ImageEngine implements ConverterEngine<ImageSettings> {
  private readonly worker: Worker
  private readonly api: Comlink.Remote<import('./convert.worker').ImageWorkerApi>

  constructor() {
    this.worker = new Worker(new URL('./convert.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.api = Comlink.wrap(this.worker)
  }

  async convert(
    file: Blob,
    baseName: string,
    settings: ImageSettings,
    options: {
      onProgress?: (progress: ConvertProgress) => void
      signal?: AbortSignal
    } = {},
  ): Promise<ConvertResult> {
    // An already-aborted signal never fires an `abort` event, so the listener below
    // would never run: the job would be posted to the worker, complete, and be
    // written to the user's folder after the batch was cancelled. Same guard
    // engine/converter.ts opens with.
    if (options.signal?.aborted) {
      throw new ConversionError('canceled', 'Conversion was canceled.')
    }

    const jobId = crypto.randomUUID()
    // SVG has to be rasterized before the worker sees it - see prepare().
    const { source, note } = await this.prepare(file, settings)
    // Rasterizing is main-thread work with several awaits in it, and the abort listener
    // below is not attached yet, so a batch cancelled during that window would fire
    // `abort` with nothing listening: the job would still be posted, run to completion,
    // and be written to the user's folder after the cancel - exactly what the check
    // this method opens with prevents for an already-cancelled batch. The bitmap is
    // closed on the way out because nothing downstream will now free it (the worker's
    // convertImage is what normally does).
    if (options.signal?.aborted) {
      if (!(source instanceof Blob)) source.close()
      throw new ConversionError('canceled', 'Conversion was canceled.')
    }
    const work = this.api
      .convertFile(
        jobId,
        source,
        baseName,
        settings,
        options.onProgress ? Comlink.proxy(options.onProgress) : undefined,
      )
      // Comlink only carries an error's message/name/stack across the boundary, so a
      // ConversionError thrown in the worker arrives as a plain Error with `.reason`
      // gone and `instanceof ConversionError` false (see engine/convert.ts's
      // NAME_PREFIX comment). Rebuilt here, the same way engine/converter.ts does it,
      // so this engine's callers see a real ConversionError rather than each having to
      // know about the encoding - BatchScheduler happens to decode again on its own,
      // but nothing else that awaits convert() would.
      .catch((error: unknown) => {
        throw isEncodedConversionError(error) ? decodeConversionError(error) : error
      })
      // A note from the main-thread half (an SVG render the canvas limits forced
      // smaller) has to be attached here: the worker never saw the SVG, so it has
      // nothing to say about it. A worker-side note (a multi-image HEIC) and this one
      // are mutually exclusive - a file is one source format or the other.
      .then((result) => (note === undefined ? result : { ...result, note }))
    const { signal } = options
    if (!signal) return work

    return new Promise<ConvertResult>((resolve, reject) => {
      const onAbort = () => {
        // Ask the worker to stop first, in case it is between awaits and can wind
        // down cleanly. Don't trust that alone, for the same reason
        // engine/converter.ts doesn't: a jSquash WASM encode is one long synchronous
        // call, so the worker cannot process a postMessage-based cancel until it has
        // finished the very file being cancelled - and then convertImage's last
        // cancellation check has already passed, so the job resolves `done` and the
        // batch's onJobSettled writes the output. Terminating is the only cancel that
        // takes effect immediately; the engine is unusable afterwards, exactly as
        // after dispose(), and BatchScheduler already discards a slot's engine once
        // its run winds down.
        void this.api.cancel(jobId)
        this.worker.terminate()
        reject(new ConversionError('canceled', 'Conversion was canceled.'))
      }
      signal.addEventListener('abort', onAbort, { once: true })

      work.then(
        (result) => {
          signal.removeEventListener('abort', onAbort)
          resolve(result)
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort)
          reject(error)
        },
      )
    })
  }

  /**
   * Hands the worker whatever it can actually work with (E2.3, issue #33).
   *
   * Everything but SVG goes across as the original Blob and is decoded in the worker.
   * SVG cannot be: `createImageBitmap` does not accept it anywhere, and the only thing
   * that renders it needs DOM APIs a worker has none of. So it is rasterized here and
   * the bitmap is *transferred* - moved, not copied - which keeps the expensive half
   * (encoding) in the worker where it belongs.
   */
  private async prepare(
    file: Blob,
    settings: ImageSettings,
  ): Promise<{ source: ImageSource; note?: string }> {
    // `.catch(() => false)` for the same reason the HEIC sniff in convert.ts has one: a
    // File whose backing bytes have moved or been deleted since intake rejects the read
    // with a DOMException, and here that would escape as a raw browser error the batch
    // shows the user verbatim. Falling through hands the Blob to the worker, whose
    // decode fails with the same wording every other unreadable file gets.
    if (!(await isSvg(file).catch(() => false))) return { source: file }
    const { bitmap, note } = await rasterizeSvg(file, Number(settings.scale))
    return { source: Comlink.transfer(bitmap, [bitmap]), note }
  }

  dispose(): void {
    this.worker.terminate()
  }
}

export const imageModule: ConverterModule<ImageSettings> = {
  id: 'image',
  category: 'image',
  label: 'Image',
  presentation: {
    item: { singular: 'image', plural: 'images' },
    intakeHint:
      'HEIC from your phone, SVG, plus PNG, JPG, WebP, and AVIF. Mixed formats are fine.',
    // An image has no playing time, so the intake store skips the scan entirely
    // rather than summing zeroes (see FileIntakeStore.recalculateDuration).
    tracksDuration: false,
  },
  accepts: (file: FileMeta) =>
    (INPUT_EXTENSIONS as readonly string[]).includes(extensionOf(file.name)),
  targetSettingKey: 'format',
  // Input and output differ since #32: HEIC can be read but is deliberately never
  // written, which is the whole point of converting one.
  inputFormats: IMAGE_INPUT_FORMAT_IDS,
  // SVG is here as of E2.4 (issue #34): produced by tracing, not by an encoder.
  outputFormats: IMAGE_OUTPUT_FORMAT_IDS,
  settingsSchema: SETTINGS_SCHEMA,
  defaultSettings: DEFAULT_SETTINGS,
  probe,
  // The code-split boundary: this import is why the jSquash WASM encoders (pulled in
  // by convert.worker.ts) cannot reach the initial bundle or an audio page's chunks.
  loadEngine: async (): Promise<ConverterEngine<ImageSettings>> => new ImageEngine(),
}
