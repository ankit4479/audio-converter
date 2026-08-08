/**
 * The pdf module (issue #39): the platform's first module whose only real target is
 * assembling several files into one output, not converting each independently.
 * Deliberately mirrors modules/image/index.ts's engine shape (a worker behind
 * Comlink) for the ordinary one-in/one-out path; combine() is genuinely new -
 * see platform/module.ts's header comment on ConverterEngine.combine for why.
 */
import * as Comlink from 'comlink'
import {
  ConversionError,
  decodeConversionError,
  isEncodedConversionError,
} from '../../engine/convert'
import { PDF_SOURCES } from '../../platform/graph'
import type {
  CapabilityReport,
  ConverterEngine,
  ConverterModule,
  ConvertProgress,
  ConvertResult,
  FileMeta,
  SettingField,
} from '../../platform/module'
import type { PdfSettings } from './convert'

const DEFAULT_SETTINGS: PdfSettings = {
  format: 'pdf',
  // Off by default: matches every other module's one-file-in/one-file-out
  // expectation, the lower-surprise choice for someone converting a single photo.
  combine: false,
}

const SETTINGS_SCHEMA: readonly SettingField[] = [
  {
    kind: 'toggle',
    key: 'combine',
    label: 'Combine into one PDF',
    // Meaningless with only one file selected - there is nothing to combine it
    // with - so it stays hidden rather than shown and inert. fileCount is
    // undefined on a hub page (no batch exists yet); treated as "don't show"
    // there too, the same conservative default as an unknown source format.
    visibleIf: ({ fileCount }) => fileCount !== undefined && fileCount > 1,
  },
]

function extensionOf(name: string): string {
  const lastDot = name.lastIndexOf('.')
  return lastDot <= 0 ? '' : name.slice(lastDot + 1).toLowerCase()
}

const INPUT_EXTENSIONS = ['jpg', 'jpeg', 'png'] as const

async function probe(): Promise<CapabilityReport> {
  // @cantoo/pdf-lib is pure JS (byte-level JPEG/PNG parsing + zlib via pako), no
  // WASM or canvas dependency - nothing to probe. Matches image module's own
  // shape of returning early only when a real requirement is missing.
  return { supported: true }
}

/** Main-thread half of the engine: owns one worker, wraps it with Comlink. */
class PdfEngine implements ConverterEngine<PdfSettings> {
  private readonly worker: Worker
  private readonly api: Comlink.Remote<import('./convert.worker').PdfWorkerApi>

  constructor() {
    this.worker = new Worker(new URL('./convert.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.api = Comlink.wrap(this.worker)
  }

  async convert(
    file: Blob,
    baseName: string,
    _settings: PdfSettings,
    options: {
      onProgress?: (progress: ConvertProgress) => void
      signal?: AbortSignal
    } = {},
  ): Promise<ConvertResult> {
    if (options.signal?.aborted) {
      throw new ConversionError('canceled', 'Conversion was canceled.')
    }
    const jobId = crypto.randomUUID()
    return this.run(
      jobId,
      this.api.convertFile(
        jobId,
        file,
        baseName,
        options.onProgress ? Comlink.proxy(options.onProgress) : undefined,
      ),
      options.signal,
    )
  }

  async combine(
    files: readonly Blob[],
    baseNames: readonly string[],
    _settings: PdfSettings,
    options: {
      onProgress?: (progress: ConvertProgress) => void
      signal?: AbortSignal
    } = {},
  ): Promise<ConvertResult> {
    if (options.signal?.aborted) {
      throw new ConversionError('canceled', 'Conversion was canceled.')
    }
    const jobId = crypto.randomUUID()
    return this.run(
      jobId,
      this.api.combineFiles(
        jobId,
        files,
        baseNames,
        options.onProgress ? Comlink.proxy(options.onProgress) : undefined,
      ),
      options.signal,
    )
  }

  /** Shared cancellation wiring between convert() and combine() - both post one
   *  request to the worker and race it against an abort, the same shape
   *  modules/image/index.ts's convert() uses for its own single request. */
  private run(
    jobId: string,
    work: Promise<ConvertResult>,
    signal: AbortSignal | undefined,
  ): Promise<ConvertResult> {
    const decoded = work.catch((error: unknown) => {
      throw isEncodedConversionError(error) ? decodeConversionError(error) : error
    })
    if (!signal) return decoded

    return new Promise<ConvertResult>((resolve, reject) => {
      const onAbort = () => {
        // Ask the worker to stop first, in case it is between awaits and can wind
        // down cleanly - same reasoning and same two-step shape as
        // modules/image/index.ts's onAbort. Don't trust that alone: terminating is
        // the only cancel that takes effect immediately.
        void this.api.cancel(jobId)
        this.worker.terminate()
        reject(new ConversionError('canceled', 'Conversion was canceled.'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
      decoded.then(
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

export const pdfModule: ConverterModule<PdfSettings> = {
  id: 'pdf',
  category: 'pdf',
  label: 'PDF',
  presentation: {
    item: { singular: 'image', plural: 'images' },
    intakeHint: 'JPG and PNG images. Mixed formats are fine.',
    tracksDuration: false,
  },
  accepts: (file: FileMeta) =>
    (INPUT_EXTENSIONS as readonly string[]).includes(extensionOf(file.name)),
  targetSettingKey: 'format',
  combineSettingKey: 'combine',
  inputFormats: PDF_SOURCES,
  outputFormats: ['pdf'],
  settingsSchema: SETTINGS_SCHEMA,
  defaultSettings: DEFAULT_SETTINGS,
  probe,
  loadEngine: async (): Promise<ConverterEngine<PdfSettings>> => new PdfEngine(),
}
