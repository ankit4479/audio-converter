/**
 * Wires BatchScheduler (issue #11) and OutputDestination (issue #10) together for
 * the Convert screen (issue #15), the way AppState.chooseDestinationAndConvert
 * does in the Mac app. Framework-agnostic - exposes subscribe/getSnapshot so
 * useConversion.ts can wire it in with useSyncExternalStore, same pattern as
 * intake/FileIntakeStore.ts.
 */
import type { AudioFile } from '../intake/audioFile'
import { baseNameFor, BatchScheduler, type JobConverter } from '../engine/batchScheduler'
import type { ConvertResult } from '../engine/convert'
import { OutputDestination } from '../output/OutputDestination'
import { resolveOutputPaths } from '../output/outputPath'
import { requireModule } from '../platform/registry'

/**
 * Everything about the format being produced that this controller needs, gathered
 * by the caller (ConverterShell, which knows the page's module and target) rather
 * than read out of engine/codec.ts's audio table as it was before E2.1, issue #31.
 * A second module has no entry in that table.
 */
export interface ConversionTarget {
  /** Registered module whose engine runs the batch. */
  readonly moduleId: string
  /** Extension every output file gets, e.g. 'mp3' or 'jpg'. */
  readonly extension: string
  /** Human name for the format, shown on the convert screen ("Converting: x to
   *  WebP"). */
  readonly label: string
  /** True when this run should call the module's ConverterEngine.combine() once
   *  over every file instead of running BatchScheduler's normal one-job-per-file
   *  loop (issue #39's "Combine into one PDF"). The caller (ConverterShell)
   *  decides this from the module's own combineSettingKey and the current
   *  settings - the controller only ever acts on what it's told. */
  readonly combine?: boolean
}

/** Progress/result state for a combine() run - deliberately not shoehorned into
 *  BatchScheduler's per-file BatchJob shape, since there is no per-file result to
 *  report, only one. null when this run isn't a combine run. */
export interface CombineSnapshot {
  readonly total: number
  readonly progress: number
  readonly result: ConvertResult | null
  readonly error: unknown
}

export interface ConversionSnapshot<TSettings = unknown> {
  readonly scheduler: BatchScheduler<TSettings> | null
  readonly destination: OutputDestination | null
  readonly targetLabel: string
  /** True once finalizing the destination (writing the last directory file is
   *  synchronous and already done by this point; building/downloading a zip is
   *  not) has settled. The done card gates on this, not just scheduler.isFinished
   *  - otherwise its primary button can render before there's anything to
   *  redownload/reopen yet. */
  readonly finalized: boolean
  /** Set if finalizing the destination threw - there's no per-issue acceptance
   *  criterion demanding a dedicated error UI for this yet, but it must not vanish
   *  as a silent unhandled rejection either. */
  readonly finishError: unknown
  /** Non-null exactly when this run is a combine() run (issue #39) - the shell
   *  renders CombineConvertView instead of ConvertView when this is set, since
   *  `scheduler` stays null for a combine run (there is no per-file batch at all). */
  readonly combine: CombineSnapshot | null
}

const EMPTY_SNAPSHOT: ConversionSnapshot = {
  scheduler: null,
  destination: null,
  targetLabel: '',
  finalized: false,
  finishError: null,
  combine: null,
}

/** Tracks one start()...finish() run's own cancellation, instead of a single
 *  controller-wide flag - a flag shared across runs would let a stale run's
 *  finish() slip through (or a live run's get skipped) if cancel() and a fresh
 *  start() race each other, since a boolean reset by the new run would silently
 *  un-cancel the old one's in-flight finalize callback. */
interface RunToken {
  canceled: boolean
}

export class ConversionController<TSettings = unknown> {
  private snapshot: ConversionSnapshot<TSettings> = EMPTY_SNAPSHOT
  private readonly listeners = new Set<() => void>()
  private unsubscribeScheduler: (() => void) | null = null
  private currentRunToken: RunToken | null = null
  /** Combine's cancel path (issue #39): a combine run has no BatchScheduler to
   *  delegate to, so it needs its own AbortController the way BatchScheduler
   *  keeps one per job internally. */
  private combineAbortController: AbortController | null = null
  /** Only ever overridden in tests, the same reasoning batchScheduler.ts's own
   *  header comment gives: real Workers aren't available in jsdom. Production
   *  code gets BatchScheduler's real default by leaving this undefined. */
  private readonly createConverter: (() => JobConverter<TSettings>) | undefined

  constructor(createConverter?: () => JobConverter<TSettings>) {
    this.createConverter = createConverter
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): ConversionSnapshot<TSettings> => this.snapshot

  private setSnapshot(next: ConversionSnapshot<TSettings>): void {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  /**
   * Ported from AppState.chooseDestinationAndConvert: prompts for a destination,
   * then kicks off the batch, writing each result as it settles. Resolves false
   * if the user canceled the destination picker - the caller (ConverterShell)
   * should stay on the setup screen in that case, same as the Mac app's early
   * `guard` return.
   *
   * `target` says which module's engine runs the batch and what is being produced
   * (E1.5, issue #29 for the module, E2.1, issue #31 for the rest): the shell can
   * be driving a different module per page now, so none of it can be assumed.
   */
  async start(
    files: readonly AudioFile[],
    settings: TSettings,
    target: ConversionTarget,
  ): Promise<boolean> {
    if (target.combine) return this.startCombine(files, settings, target)

    const destination = await OutputDestination.choose(files.length)
    if (!destination) return false

    const outputPaths = resolveOutputPaths(
      files.map((f) => f.relativePath),
      target.extension,
    )
    const scheduler = new BatchScheduler<TSettings>({
      moduleId: target.moduleId,
      createConverter: this.createConverter,
      onJobSettled: async (job) => {
        if (job.status.kind !== 'done') return
        const index = files.findIndex((f) => f.id === job.file.id)
        await destination.write(outputPaths[index], job.status.result.blob)
      },
    })

    const token: RunToken = { canceled: false }
    this.currentRunToken = token
    this.unsubscribeScheduler?.()
    this.unsubscribeScheduler = scheduler.subscribe(() => {
      this.setSnapshot({ ...this.snapshot })
    })
    this.setSnapshot({
      scheduler,
      destination,
      targetLabel: target.label,
      finalized: false,
      finishError: null,
      combine: null,
    })

    void scheduler.run(files, settings).then(
      () => {
        // A "Change" cancel mid-batch must not still trigger a zip download behind
        // the user's back once they've already navigated away - only finalize a
        // run that actually ran to completion (or died out on its own failures).
        // Checked on this run's own token, not a shared flag: a later start() must
        // not accidentally un-cancel this one, and this one canceling must not
        // affect a run that started after it.
        if (token.canceled) return
        return destination.finish().then(
          () => this.setSnapshot({ ...this.snapshot, finalized: true }),
          (error: unknown) =>
            this.setSnapshot({ ...this.snapshot, finalized: true, finishError: error }),
        )
      },
      (error: unknown) => {
        this.setSnapshot({ ...this.snapshot, finalized: true, finishError: error })
      },
    )
    return true
  }

  /**
   * Runs the module's ConverterEngine.combine() once over every file, instead of
   * BatchScheduler's normal one-job-per-file loop - the many-in/one-out shape
   * platform/module.ts's ConverterEngine.combine() header comment explains.
   * `start()` routes here when `target.combine` is true; never called directly.
   */
  private async startCombine(
    files: readonly AudioFile[],
    settings: TSettings,
    target: ConversionTarget,
  ): Promise<boolean> {
    const destination = await OutputDestination.choose(1)
    if (!destination) return false

    const engine = await requireModule(target.moduleId).loadEngine()
    if (!engine.combine) {
      // A module declaring combineSettingKey without its engine implementing
      // combine() is a module/engine contract mismatch, not a user-facing case -
      // same class of "this should never happen" the batch path leaves to
      // BatchScheduler's own moduleId guard.
      throw new Error(`Module "${target.moduleId}" has no combine() to run.`)
    }

    const token: RunToken = { canceled: false }
    this.currentRunToken = token
    const abortController = new AbortController()
    this.combineAbortController = abortController
    this.unsubscribeScheduler?.()
    this.unsubscribeScheduler = null

    this.setSnapshot({
      scheduler: null,
      destination,
      targetLabel: target.label,
      finalized: false,
      finishError: null,
      combine: { total: files.length, progress: 0, result: null, error: null },
    })

    void engine
      .combine(
        files.map((f) => f.file),
        files.map((f) => baseNameFor(f.relativePath)),
        settings,
        {
          onProgress: (progress) => {
            this.setSnapshot({
              ...this.snapshot,
              combine: { ...this.snapshot.combine!, progress: progress.fraction },
            })
          },
          signal: abortController.signal,
        },
      )
      .then(
        async (result) => {
          engine.dispose()
          if (token.canceled) return
          this.setSnapshot({
            ...this.snapshot,
            combine: { ...this.snapshot.combine!, progress: 1, result },
          })
          // Guarded the same way BatchScheduler's onJobSettled guards its own
          // destination.write() call (see that file's comment): a revoked folder
          // permission or a quota error here is real, and left unguarded it would
          // escape this .then() as an unhandled rejection while leaving
          // combine.error/finalized both unset - CombineConvertView has no render
          // branch for that state, so the screen would hang forever instead of
          // showing the failed card.
          try {
            await destination.write(result.fileName, result.blob)
          } catch (error) {
            this.setSnapshot({
              ...this.snapshot,
              finalized: true,
              combine: { ...this.snapshot.combine!, error },
            })
            return
          }
          await destination.finish().then(
            () => this.setSnapshot({ ...this.snapshot, finalized: true }),
            (error: unknown) =>
              this.setSnapshot({ ...this.snapshot, finalized: true, finishError: error }),
          )
        },
        (error: unknown) => {
          engine.dispose()
          if (token.canceled) return
          this.setSnapshot({
            ...this.snapshot,
            finalized: true,
            combine: { ...this.snapshot.combine!, error },
          })
        },
      )
    return true
  }

  /**
   * ConvertView.swift's cancelAndReturnToSetup half - stops in-flight work. The
   * screen switch and "file list intact" guarantee are the shell's job: this
   * controller never touches FileIntakeStore.
   *
   * A batch that already ran to completion is left alone. There is nothing left to
   * abort, and marking it canceled would make its pending finish() callback skip
   * destination.finish() - the user would lose a finished conversion's zip with no
   * error at all. That window (run() resolved, its .then not yet reached) became
   * reachable in E1.5 (issue #29), which wires cancel() to the widget unmounting,
   * so any navigation can now land inside it.
   */
  cancel(): void {
    // Branches on the *current* run's own shape (this.snapshot.combine, which
    // start() and startCombine() both set accurately for their own run), not on
    // this.combineAbortController's mere existence - that field is only ever
    // cleared in reset(), so once a combine run has happened once it would still
    // read as truthy during every later normal batch run too, aborting a dead
    // controller instead of reaching this.snapshot.scheduler?.cancel() below.
    if (this.snapshot.combine) {
      if (this.snapshot.combine.result || this.snapshot.combine.error) return
      if (this.currentRunToken) this.currentRunToken.canceled = true
      this.combineAbortController?.abort()
      return
    }
    if (this.snapshot.scheduler?.isFinished) return
    if (this.currentRunToken) this.currentRunToken.canceled = true
    this.snapshot.scheduler?.cancel()
  }

  /** AppState.convertMore(): drops this run's scheduler/destination so the next
   *  start() begins clean. Clearing the file list is the caller's job. */
  reset(): void {
    this.unsubscribeScheduler?.()
    this.unsubscribeScheduler = null
    this.combineAbortController = null
    this.setSnapshot(EMPTY_SNAPSHOT)
  }

  async revealDestination(): Promise<void> {
    await this.snapshot.destination?.revealDestination()
  }
}
