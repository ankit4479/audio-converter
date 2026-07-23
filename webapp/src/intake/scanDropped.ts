import type { ScannedFile } from './audioFile'

/**
 * Drag-and-drop folder support (issue's own "Browser specifics": webkitGetAsEntry,
 * universally supported since ~2013 in Chrome/Firefox/Safari). `getAsFileSystemHandle()`
 * is deliberately not used even though it's mentioned as an option in the issue:
 * it's Chrome/Edge-only and newer, and for read-only intake (just getting File objects
 * to scan and later convert) it offers nothing webkitGetAsEntry doesn't already give
 * universally - the handle-based API only matters when you need to write back to the
 * same location, which is issue #10's destination-folder concern, not source intake.
 */

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const readBatch = () => {
      // readEntries() only returns a batch at a time and must be called repeatedly
      // until it resolves empty - it does not guarantee returning everything in one
      // call, a well-documented quirk of this API.
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(all)
        } else {
          all.push(...entries)
          readBatch()
        }
      }, reject)
    }
    readBatch()
  })
}

function getEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function walkEntry(
  entry: FileSystemEntry,
  relativePath: string,
  out: ScannedFile[],
): Promise<void> {
  if (entry.isFile) {
    const file = await getEntryFile(entry as FileSystemFileEntry)
    out.push({ file, relativePath })
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const children = await readAllEntries(reader)
    await Promise.all(
      children.map((child) => walkEntry(child, `${relativePath}/${child.name}`, out)),
    )
  }
}

/**
 * Scans a drop's DataTransferItemList into ScannedFiles, matching FileIntake.scan's
 * relativePath scheme: a loose dropped file is just its name, a dropped folder's
 * contents are prefixed with that folder's name.
 */
export async function scanDroppedItems(
  items: DataTransferItemList,
): Promise<ScannedFile[]> {
  // webkitGetAsEntry() must be called synchronously for every item before any
  // `await` - browsers invalidate DataTransferItems asynchronously once the drop
  // event handler's synchronous execution ends, another well-known drag-and-drop
  // API gotcha.
  const topLevelEntries: FileSystemEntry[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    if (entry) topLevelEntries.push(entry)
  }

  const out: ScannedFile[] = []
  await Promise.all(topLevelEntries.map((entry) => walkEntry(entry, entry.name, out)))
  return out
}
