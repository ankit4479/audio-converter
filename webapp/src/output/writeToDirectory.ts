/**
 * Chrome/Edge output path: writes one converted file into a chosen destination
 * directory, recreating the source's subfolders (issue #10's "mirroring
 * relativePath, same as resolvedOutputURL"). Each call opens, writes, and closes its
 * own FileSystemWritableFileStream - the browser streams that write to disk itself,
 * so nothing here holds more than one file's bytes in memory at a time.
 */

export class OutputPermissionDeniedError extends Error {
  constructor(cause: unknown) {
    super('Permission to write to the chosen folder was denied.', { cause })
    this.name = 'OutputPermissionDeniedError'
  }
}

async function getOrCreateSubdirectory(
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create: true })
  }
  return dir
}

/** Writes `blob` to `relativePath` inside `root`, creating any missing
 *  subdirectories first. `relativePath` uses '/' separators, matching AudioFile's
 *  own relativePath scheme. */
export async function writeToDirectory(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  blob: Blob,
): Promise<void> {
  const segments = relativePath.split('/')
  const fileName = segments.pop()
  if (!fileName) throw new Error(`Invalid output path: ${relativePath}`)

  try {
    const dir = await getOrCreateSubdirectory(root, segments)
    const fileHandle = await dir.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    try {
      await writable.write(blob)
    } finally {
      await writable.close()
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new OutputPermissionDeniedError(error)
    }
    throw error
  }
}
