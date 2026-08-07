import type { ConverterModule } from '../platform/module'
import { deduplicateAgainst, type AudioFile, type ScannedFile } from './audioFile'
import { totalDuration } from './duration'
import { filterAndBuildAudioFiles } from './intake'

/** All this store needs of a module: whether it accepts a file, and whether a
 *  playing time is a meaningful thing to compute for these files at all (E2.1,
 *  issue #31 - it isn't, for images). `presentation` is optional so the many tests
 *  that hand in a bare { accepts } fake keep working; a module that omits it is
 *  treated as one that does track duration, which is the pre-#31 behaviour. */
export type IntakeModule = Pick<ConverterModule, 'accepts'> &
  Partial<Pick<ConverterModule, 'presentation'>>

export interface FileIntakeSnapshot {
  readonly files: readonly AudioFile[]
  readonly totalDuration: number
  readonly isCalculatingDuration: boolean
  /** Files the most recent setModule() had to let go of, because the module now
   *  driving the shell doesn't accept them (E1.5, issue #29 - swapping from the
   *  audio converter to, say, an image one). Carried in the snapshot rather than
   *  returned from setModule() so the shell can tell the user about them through
   *  the same useSyncExternalStore subscription it already has, and cleared by
   *  acknowledgeDroppedFiles() once it has. */
  readonly droppedOnModuleChange: readonly AudioFile[]
}

const EMPTY_SNAPSHOT: FileIntakeSnapshot = {
  files: [],
  totalDuration: 0,
  isCalculatingDuration: false,
  droppedOnModuleChange: [],
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
  /** Not readonly since E1.5 (issue #29): one store instance outlives the widget
   *  now (see sharedIntakeStore.ts), so which module gates intake can change
   *  under it when the user switches to a converter another module owns. */
  private module: IntakeModule

  constructor(module: IntakeModule) {
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

  /**
   * Switches which module's accepts() gates this store (E1.5, issue #29). Files
   * already added are carried forward where the new module accepts them and
   * dropped where it doesn't - the dropped ones land in
   * snapshot.droppedOnModuleChange so the shell can say so, rather than files
   * vanishing from the list with no explanation.
   *
   * A no-op for the same module, which is the common case: this is called on
   * every mount of the widget, and every same-module target change (mp3 to aac)
   * remounts it.
   */
  setModule(module: IntakeModule): void {
    if (module === this.module) return
    this.module = module

    const kept: AudioFile[] = []
    const dropped: AudioFile[] = []
    for (const file of this.snapshot.files) {
      ;(module.accepts(file.file) ? kept : dropped).push(file)
    }
    if (dropped.length === 0) {
      // Nothing to report for this swap - but an earlier swap's notice must not
      // survive into it, or the shell would keep rendering "N files were removed:
      // the <new module> converter can't read them" about files a different module
      // rejected (and, once the list is empty, about files that are no longer in
      // it at all). No recalculateDuration: the list itself didn't change.
      this.acknowledgeDroppedFiles()
      return
    }

    this.setSnapshot({ files: kept, droppedOnModuleChange: dropped })
    // Duration is a property of the file list, so a shorter list needs a fresh
    // total; recalculateDuration()'s generation guard also invalidates any scan
    // still in flight for the pre-swap list.
    this.recalculateDuration()
  }

  /** Dismisses the "these files were dropped" notice (see
   *  snapshot.droppedOnModuleChange). */
  acknowledgeDroppedFiles(): void {
    if (this.snapshot.droppedOnModuleChange.length === 0) return
    this.setSnapshot({ droppedOnModuleChange: [] })
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
    // Bumped even when we skip the scan, so a scan already in flight for an older
    // file list can't land afterwards and revive a duration for the new one.
    this.generation += 1
    // Images have no playing time to sum (E2.1, issue #31). Skipping the scan
    // rather than letting it run and return 0 avoids opening a Mediabunny parser
    // per file for an answer that means nothing.
    if (this.module.presentation && !this.module.presentation.tracksDuration) {
      this.setSnapshot({ totalDuration: 0, isCalculatingDuration: false })
      return
    }
    const generation = this.generation
    this.setSnapshot({ isCalculatingDuration: true })

    const filesSnapshot = this.snapshot.files
    void totalDuration(filesSnapshot).then((total) => {
      if (generation !== this.generation) return
      this.setSnapshot({ totalDuration: total, isCalculatingDuration: false })
    })
  }
}
