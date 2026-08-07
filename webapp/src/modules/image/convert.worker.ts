/**
 * The image module's Comlink entry point (E2.1, issue #31), mirroring
 * engine/convert.worker.ts for audio: all decode/encode happens here, off the main
 * thread, and main-thread code only ever reaches it through `Comlink.wrap`.
 *
 * A separate worker from the audio one on purpose - that is the code-split boundary
 * the module contract promises. This worker's chunk pulls in the jSquash WASM
 * encoders (and only when a conversion needs them); the audio worker's pulls in
 * Mediabunny. Neither ever loads the other.
 */
import * as Comlink from 'comlink'
import type { ConvertProgress, ConvertResult } from '../../engine/convert'
import { convertImage, type ImageSettings, type ImageSource } from './convert'

const controllers = new Map<string, AbortController>()

const api = {
  async convertFile(
    jobId: string,
    // A Blob for anything the worker can decode itself; an ImageBitmap for SVG, which
    // the main thread had to rasterize (see svg.ts) and transfers in.
    file: ImageSource,
    baseName: string,
    settings: ImageSettings,
    // Callers must wrap this in Comlink.proxy(...) - plain functions aren't
    // structured-cloneable across the worker boundary.
    onProgress?: (progress: ConvertProgress) => void,
  ): Promise<ConvertResult> {
    const controller = new AbortController()
    controllers.set(jobId, controller)
    try {
      return await convertImage(file, baseName, settings, {
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

export type ImageWorkerApi = typeof api

Comlink.expose(api)
