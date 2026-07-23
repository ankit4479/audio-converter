/**
 * Ported from Sources/AudioConverter/Models/AudioFile.swift. `file` replaces the
 * Swift struct's `url` - there's no filesystem path to keep in the browser, the File
 * itself is both the identity and the readable content.
 */
export interface AudioFile {
  readonly id: string
  readonly file: File
  /** Path relative to the drop root: a loose file is just its filename; a file found
   *  inside a dropped folder is prefixed with that folder's name, the same way
   *  FileIntake.scan does it, so output can later mirror source structure. */
  readonly relativePath: string
  readonly fileSize: number
  readonly displayName: string
}

/** What every intake source (drop, directory picker, file inputs) converges to
 *  before the extension filter and AudioFile construction below are applied. */
export interface ScannedFile {
  file: File
  relativePath: string
}

let nextId = 0
function makeId(): string {
  nextId += 1
  return `audio-file-${nextId}`
}

export function toAudioFile(scanned: ScannedFile): AudioFile {
  return {
    id: makeId(),
    file: scanned.file,
    relativePath: scanned.relativePath,
    fileSize: scanned.file.size,
    displayName: scanned.file.name,
  }
}

/**
 * Ported from AppState.addFiles's dedup (AppState.swift:52-60). The Swift version
 * dedupes by absolute filesystem path, which doesn't exist in the browser; the
 * closest available proxy is the computed relativePath, which is also exactly what
 * the "drop the same folder twice" acceptance criterion is checking for - two scans
 * of the same folder produce files with identical folder-prefixed relative paths.
 */
export function deduplicateAgainst(
  existing: readonly AudioFile[],
  incoming: readonly AudioFile[],
): AudioFile[] {
  const seen = new Set(existing.map((f) => f.relativePath))
  const result: AudioFile[] = []
  for (const file of incoming) {
    if (seen.has(file.relativePath)) continue
    seen.add(file.relativePath)
    result.push(file)
  }
  return result
}
