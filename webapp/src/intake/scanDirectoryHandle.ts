import type { ScannedFile } from './audioFile'

async function walkDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  relativePath: string,
  out: ScannedFile[],
): Promise<void> {
  const children: Promise<void>[] = []
  for await (const [name, childHandle] of handle.entries()) {
    const childPath = `${relativePath}/${name}`
    if (childHandle.kind === 'file') {
      children.push(
        childHandle.getFile().then((file) => {
          out.push({ file, relativePath: childPath })
        }),
      )
    } else {
      children.push(walkDirectoryHandle(childHandle, childPath, out))
    }
  }
  await Promise.all(children)
}

/** Walks a FileSystemDirectoryHandle (from `showDirectoryPicker()`, Chrome/Edge)
 *  into ScannedFiles, same relativePath scheme as the drop and webkitdirectory paths:
 *  prefixed with the picked folder's own name. */
export async function scanDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<ScannedFile[]> {
  const out: ScannedFile[] = []
  await walkDirectoryHandle(handle, handle.name, out)
  return out
}

/** Feature-detected: `showDirectoryPicker` only exists in Chrome/Edge. Callers fall
 *  back to a `<input type="file" webkitdirectory>` click when this returns false,
 *  per the issue's own "Browser specifics". */
export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/** Resolves to null if the user cancels the picker (an AbortError, not a real
 *  failure) rather than throwing. */
export async function pickDirectory(): Promise<ScannedFile[] | null> {
  if (!window.showDirectoryPicker) return null
  try {
    const handle = await window.showDirectoryPicker()
    return await scanDirectoryHandle(handle)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}
