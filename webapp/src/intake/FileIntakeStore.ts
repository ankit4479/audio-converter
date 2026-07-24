import type { ConverterModule } from '../platform/module'
import { deduplicateAgainst, type AudioFile, type ScannedFile } from './audioFile'
import { totalDuration } from './duration'
import { filterAndBuildAudioFiles } from './intake'

export interface FileIntakeSnapshot {
  readonly files: readonly AudioFile[]
  readonly totalDuration: number
  readonly isCalculatingDuration: boolean
}

const EMPTY_SNAPSHOT: FileIntakeSnapshot = {
  files: [],
  totalDuration: 0,
  isCalculatingDuration: false,
}

/**
 * Ported from the file-related slice of AppState.swift: addFiles's dedup-then-append,
 * clearFiles, and recalculateDuration's generation guard (a duration scan started by
 * an earlier addFiles call is ignored if superseded by a later one before it
 * finishes). Framework-agnostic - exposes subscribe/getSnapshot so issue #14's React
 * screen can wire it in with `useSyncExternalStore` without this module depending on
 * React at all.
 */
export class FileIntakeStore {
  private snapshot: FileIntakeSnapshot = EMPTY_SNAPSHOT
  private generation = 0
  private readonly listeners = new Set<() => void>()
  private readonly module: Pick<ConverterModule, 'accepts'>

  constructor(module: Pick<ConverterModule, 'accepts'>) {
    this.module = module
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): FileIntakeSnapshot => this.snapshot

  private setSnapshot(next: Partial<FileIntakeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next }
    for (const listener of this.listeners) listener()
  }

  /** Ported from AppState.addFiles (AppState.swift:52-60). */
  addFiles(scanned: readonly ScannedFile[]): void {
    const candidates = filterAndBuildAudioFiles(scanned, this.module)
    if (candidates.length === 0) return
    const newFiles = deduplicateAgainst(this.snapshot.files, candidates)
    if (newFiles.length === 0) return

    this.setSnapshot({ files: [...this.snapshot.files, ...newFiles] })
    this.recalculateDuration()
  }

  /** Ported from AppState.clearFiles (AppState.swift:62-67). */
  clear(): void {
    this.generation += 1
    this.snapshot = EMPTY_SNAPSHOT
    for (const listener of this.listeners) listener()
  }

  /** Ported from AppState.recalculateDuration (AppState.swift:69-80): recomputes
   *  from the full current file list on every call rather than incrementally, guarded
   *  by a generation counter so a stale in-flight scan can't overwrite a newer one's
   *  result. */
  private recalculateDuration(): void {
    this.generation += 1
    const generation = this.generation
    this.setSnapshot({ isCalculatingDuration: true })

    const filesSnapshot = this.snapshot.files
    void totalDuration(filesSnapshot).then((total) => {
      if (generation !== this.generation) return
      this.setSnapshot({ totalDuration: total, isCalculatingDuration: false })
    })
  }
}
