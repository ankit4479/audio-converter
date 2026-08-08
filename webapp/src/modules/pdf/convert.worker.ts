/**
 * The pdf module's Comlink entry point (issue #39), mirroring
 * modules/image/convert.worker.ts: all PDF assembly happens here, off the main
 * thread. A separate worker/chunk from audio and image - @cantoo/pdf-lib's own code
 * (byte-level JPEG/PNG parsing, zlib via pako) never needs to load into either.
 */
import * as Comlink from 'comlink'
import type { ConvertProgress, ConvertResult } from '../../engine/convert'
import { combineImagesToPdf, imageToPdf } from './convert'

const controllers = new Map<string, AbortController>()

const api = {
  async convertFile(
    jobId: string,
    file: Blob,
    baseName: string,
    onProgress?: (progress: ConvertProgress) => void,
  ): Promise<ConvertResult> {
    const controller = new AbortController()
    controllers.set(jobId, controller)
    try {
      return await imageToPdf(file, baseName, { onProgress, signal: controller.signal })
    } finally {
      controllers.delete(jobId)
    }
  },

  async combineFiles(
    jobId: string,
    files: readonly Blob[],
    baseNames: readonly string[],
    onProgress?: (progress: ConvertProgress) => void,
  ): Promise<ConvertResult> {
    const controller = new AbortController()
    controllers.set(jobId, controller)
    try {
      return await combineImagesToPdf(files, baseNames, {
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

export type PdfWorkerApi = typeof api

Comlink.expose(api)
