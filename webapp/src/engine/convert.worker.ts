/**
 * The Comlink-exposed entry point. All decode/encode work happens here, off the main
 * thread — main-thread code only ever calls this through `Comlink.wrap`, it never
 * imports convert.ts directly.
 *
 * `jobId` lets one worker track (and cancel) more than one in-flight conversion, but
 * issue #11's batch scheduler is free to run one job per worker instance instead and
 * lean on `Worker.terminate()` for the blunt case, the same way the Mac app's
 * ConversionEngine calls `process.terminate()` — this module's cancel() is the
 * cooperative alternative, letting Mediabunny finalize cleanly rather than being
 * killed mid-write.
 */
import * as Comlink from 'comlink'
import type { ConversionSettings } from './codec'
import { convertFile, type ConvertProgress, type ConvertResult } from './convert'

const controllers = new Map<string, AbortController>()

const api = {
  async convertFile(
    jobId: string,
    file: Blob,
    baseName: string,
    settings: ConversionSettings,
    // Callers must wrap this in Comlink.proxy(...) — plain functions aren't
    // structured-cloneable across the worker boundary.
    onProgress?: (progress: ConvertProgress) => void,
  ): Promise<ConvertResult> {
    const controller = new AbortController()
    controllers.set(jobId, controller)
    try {
      return await convertFile(file, baseName, settings, {
        onProgress,
        signal: controller.signal,
      })
    } finally {
      controllers.delete(jobId)
    }
  },

  cancel(jobId: string) {
    controllers.get(jobId)?.abort()
  },
}

export type ConverterWorkerApi = typeof api

Comlink.expose(api)
