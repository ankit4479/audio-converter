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
  IMAGE_FORMAT_IDS,
  IMAGE_INPUT_FORMAT_IDS,
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
import type { ImageFormatId, ImageSettings } from './convert'

/** Input extensions this module accepts. Broader than the graph's output formats:
 *  `jpeg` is the same format as `jpg` under another name, and `heic`/`heif` (E2.2,
 *  issue #32) are read but never written. SVG (#33) joins with the decoder that makes
 *  it work - accepting a format now would mean taking a file we then fail on. */
const INPUT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'heic', 'heif'] as const

/** Straight from the graph (the same way modules/audio takes AUDIO_ENCODABLE_TARGETS
 *  from there) rather than a second hand-written list: every image format is both a
 *  source and a target, so the graph's node set *is* this module's input and output
 *  set, and a copy could only ever drift from it. */
const IMAGE_FORMATS: readonly ImageFormatId[] = IMAGE_FORMAT_IDS

/** WebP as the default target: it is the format that is both broadly supported and
 *  materially smaller than the PNG or JPEG most people arrive with, which is the
 *  same reasoning behind the audio module defaulting to MP3. */
const DEFAULT_SETTINGS: ImageSettings = {
  format: 'webp',
  quality: 80,
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
    options: IMAGE_FORMATS.map((id) => ({
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
    const work = this.api
      .convertFile(
        jobId,
        file,
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
      'HEIC from your phone, plus PNG, JPG, WebP, and AVIF. Mixed formats are fine.',
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
  outputFormats: IMAGE_FORMATS,
  settingsSchema: SETTINGS_SCHEMA,
  defaultSettings: DEFAULT_SETTINGS,
  probe,
  // The code-split boundary: this import is why the jSquash WASM encoders (pulled in
  // by convert.worker.ts) cannot reach the initial bundle or an audio page's chunks.
  loadEngine: async (): Promise<ConverterEngine<ImageSettings>> => new ImageEngine(),
}
