/**
 * Safari/Firefox fallback (no File System Access API): builds one zip client-side
 * with folder structure preserved, then triggers a normal browser download.
 *
 * Uses client-zip rather than hand-rolling zip encoding - it's built exactly for
 * this: `downloadZip` consumes its files as an async iterable and streams the
 * compressed output as it goes, so entries are read from `entries` one at a time
 * (never all buffered up front) the way ConversionEngine's per-job writes are on
 * the directory-output path. The only unavoidable buffering is the final
 * `Response.blob()` below - the browser needs a complete Blob to hand to a download
 * anchor since there's no on-disk target to stream to without the File System
 * Access API, which is exactly why this is the fallback path.
 */
import { downloadZip } from 'client-zip'

export interface ZipEntry {
  relativePath: string
  blob: Blob
}

export async function buildZip(entries: AsyncIterable<ZipEntry>): Promise<Blob> {
  const files = (async function* () {
    for await (const entry of entries) {
      yield { name: entry.relativePath, input: entry.blob }
    }
  })()
  const response = downloadZip(files)
  return response.blob()
}

/** Triggers a normal save-as/download for `blob` named `fileName`, the same
 *  mechanism a plain <a download> click uses. The anchor is briefly attached to the
 *  document - Firefox does not reliably dispatch a click on a detached element - and
 *  the object URL is revoked on the next tick rather than synchronously, since some
 *  browsers read it asynchronously after click() returns. */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
