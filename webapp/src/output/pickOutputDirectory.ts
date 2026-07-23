/**
 * Ported from AppState's "Choose a folder to save your converted songs" prompt.
 * Reuses the same showDirectoryPicker Window augmentation intake/scanDirectoryHandle.ts
 * declares, requesting 'readwrite' instead of the intake side's read-only default.
 */
import { OutputPermissionDeniedError } from './writeToDirectory'

export function supportsDirectoryOutput(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/** Resolves to null if the user cancels the picker (an AbortError, not a real
 *  failure). Throws OutputPermissionDeniedError if the browser grants the picker
 *  but denies readwrite access to the chosen folder. */
export async function pickOutputDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new OutputPermissionDeniedError(error)
    }
    throw error
  }
}
