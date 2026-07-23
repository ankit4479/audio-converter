/**
 * Unifies the three ways a converted batch can land on disk (issue #10):
 *  - 'directory' (Chrome/Edge): write() streams each file straight into the chosen
 *    folder as it finishes converting.
 *  - 'zip' (Safari/Firefox, 2+ files): write() hands each file to a StreamingQueue
 *    that client-zip drains one at a time; finish() closes the queue and triggers
 *    the download once the zip is fully built.
 *  - 'single-download' (Safari/Firefox, 1 file): the only file downloads directly,
 *    no zip involved, matching the issue's "single file batches download directly".
 */
import { pickOutputDirectory, supportsDirectoryOutput } from './pickOutputDirectory'
import { writeToDirectory } from './writeToDirectory'
import { buildZip, triggerDownload, type ZipEntry } from './zipDownload'
import { StreamingQueue } from './streamingQueue'

export type OutputMode = 'directory' | 'zip' | 'single-download'

export function outputModeFor(fileCount: number): OutputMode {
  if (supportsDirectoryOutput()) return 'directory'
  return fileCount <= 1 ? 'single-download' : 'zip'
}

/** Shown before conversion starts, per the issue's "must say plainly which mode
 *  the browser is in, before conversion starts, not after". */
export const OUTPUT_MODE_LABEL: Record<OutputMode, string> = {
  directory: 'Converted files save straight to the folder you choose.',
  'single-download':
    "This browser can't save straight to a folder, so the converted file downloads normally.",
  zip: "This browser can't save straight to a folder, so converted files download together as one zip.",
}

function fileNameFromPath(relativePath: string): string {
  const parts = relativePath.split('/')
  return parts[parts.length - 1]
}

export class OutputDestination {
  readonly mode: OutputMode
  private readonly zipFileName: string
  private readonly directoryHandle: FileSystemDirectoryHandle | undefined
  private readonly zipQueue: StreamingQueue<ZipEntry> | null
  private readonly zipDone: Promise<void> | null
  private singleEntry: ZipEntry | null = null

  private constructor(
    mode: OutputMode,
    zipFileName: string,
    directoryHandle?: FileSystemDirectoryHandle,
  ) {
    this.mode = mode
    this.zipFileName = zipFileName
    this.directoryHandle = directoryHandle
    if (mode === 'zip') {
      const zipQueue = new StreamingQueue<ZipEntry>()
      this.zipQueue = zipQueue
      this.zipDone = buildZip(zipQueue)
        .then((blob) => {
          triggerDownload(blob, this.zipFileName)
        })
        .catch((error: unknown) => {
          // Without this, a zip-build failure would leave any write() blocked on a
          // full buffer (StreamingQueue.push awaiting room) hanging forever, since
          // nothing would ever pull from it again - fail() wakes and rejects that
          // wait instead. zipDone itself still rejects too, for finish() to surface.
          zipQueue.fail(error)
          throw error
        })
      // A caller whose write() already threw (via the fail() above) may never call
      // finish() to observe this same rejection - without a handler here, that
      // would surface as an unhandled promise rejection console warning even though
      // the real error already reached the caller through write().
      this.zipDone.catch(() => {})
    } else {
      this.zipQueue = null
      this.zipDone = null
    }
  }

  /** Resolves to null if directory mode was picked but the user canceled the
   *  folder picker - callers should treat that as "conversion not started", the
   *  same way canceling file intake's directory picker does. */
  static async choose(
    fileCount: number,
    zipFileName = 'converted.zip',
  ): Promise<OutputDestination | null> {
    const mode = outputModeFor(fileCount)
    if (mode === 'directory') {
      const handle = await pickOutputDirectory()
      if (!handle) return null
      return new OutputDestination(mode, zipFileName, handle)
    }
    return new OutputDestination(mode, zipFileName)
  }

  async write(relativePath: string, blob: Blob): Promise<void> {
    if (this.mode === 'directory') {
      await writeToDirectory(this.directoryHandle!, relativePath, blob)
    } else if (this.mode === 'zip') {
      await this.zipQueue!.push({ relativePath, blob })
    } else {
      this.singleEntry = { relativePath, blob }
    }
  }

  /** Finalizes the destination. No-op for directory mode (already written as it
   *  went). For zip mode, closes the queue and waits for the download to fire. For
   *  single-download, triggers the one download now. */
  async finish(): Promise<void> {
    if (this.mode === 'zip') {
      this.zipQueue!.close()
      await this.zipDone
    } else if (this.mode === 'single-download' && this.singleEntry) {
      triggerDownload(
        this.singleEntry.blob,
        fileNameFromPath(this.singleEntry.relativePath),
      )
    }
  }
}
