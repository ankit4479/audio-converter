/**
 * Main-thread entry point: spawns the conversion worker, wraps it with Comlink, and
 * exposes a plain `convert()` function so callers never touch Worker or Comlink
 * directly. One Converter owns one worker; issue #11's batch scheduler is what decides
 * how many Converters to run concurrently.
 */
import * as Comlink from 'comlink'
import type { ConversionSettings } from './codec'
import {
  ConversionError,
  decodeConversionError,
  isEncodedConversionError,
  type ConversionErrorReason,
  type ConvertProgress,
  type ConvertResult,
} from './convert'
import type { ConverterWorkerApi } from './convert.worker'

export { ConversionError }
export type { ConversionErrorReason, ConvertProgress, ConvertResult }

export class Converter {
  private readonly worker: Worker
  private readonly api: Comlink.Remote<ConverterWorkerApi>

  constructor() {
    this.worker = new Worker(new URL('./convert.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.api = Comlink.wrap<ConverterWorkerApi>(this.worker)
  }

  async convert(
    file: Blob,
    baseName: string,
    settings: ConversionSettings,
    options: {
      onProgress?: (progress: ConvertProgress) => void
      signal?: AbortSignal
    } = {},
  ): Promise<ConvertResult> {
    if (options.signal?.aborted) {
      throw new ConversionError('canceled', 'Conversion was canceled.')
    }

    const jobId = crypto.randomUUID()
    const workPromise = this.api
      .convertFile(
        jobId,
        file,
        baseName,
        settings,
        options.onProgress ? Comlink.proxy(options.onProgress) : undefined,
      )
      .catch((error: unknown) => {
        throw isEncodedConversionError(error) ? decodeConversionError(error) : error
      })

    const { signal } = options
    if (!signal) return workPromise

    return new Promise<ConvertResult>((resolve, reject) => {
      const onAbort = () => {
        // Ask the worker to cancel cooperatively first, in case it's mid-encode
        // and can wind down cleanly. Don't trust it alone, though: measured while
        // building this, a pure-PCM conversion (WAV, today's only wired-up format)
        // can run as one long microtask chain that never yields to the macrotask
        // queue a postMessage-based cancel needs, so the cooperative request can
        // sit unprocessed for the conversion's *entire* remaining duration - a real
        // multi-second 200M-sample test proved this: cancel() was called 5ms in but
        // the result still resolved 3.5s later, uncancelled. Terminating the worker
        // outright is the only cancellation actually guaranteed to take effect
        // immediately, the same trade-off the Mac app makes calling
        // process.terminate() on ffmpeg rather than asking it to stop gracefully.
        // The Converter is unusable after this, same as calling dispose().
        void this.api.cancel(jobId)
        this.worker.terminate()
        reject(new ConversionError('canceled', 'Conversion was canceled.'))
      }
      signal.addEventListener('abort', onAbort, { once: true })

      workPromise.then(
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

  /** Releases the worker. The Converter is unusable after this. */
  dispose(): void {
    this.worker.terminate()
  }
}
