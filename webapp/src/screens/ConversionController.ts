/**
 * Wires BatchScheduler (issue #11) and OutputDestination (issue #10) together for
 * the Convert screen (issue #15), the way AppState.chooseDestinationAndConvert
 * does in the Mac app. Framework-agnostic - exposes subscribe/getSnapshot so
 * useConversion.ts can wire it in with useSyncExternalStore, same pattern as
 * intake/FileIntakeStore.ts.
 */
import type { AudioFile } from '../intake/audioFile'
import { BatchScheduler, type JobConverter } from '../engine/batchScheduler'
import { CODECS, type ConversionSettings } from '../engine/codec'
import { OutputDestination } from '../output/OutputDestination'
import { resolveOutputPaths } from '../output/outputPath'

export interface ConversionSnapshot {
  readonly scheduler: BatchScheduler | null
  readonly destination: OutputDestination | null
  readonly codecLabel: string
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
}

const EMPTY_SNAPSHOT: ConversionSnapshot = {
  scheduler: null,
  destination: null,
  codecLabel: '',
  finalized: false,
  finishError: null,
}

/** Tracks one start()...finish() run's own cancellation, instead of a single
 *  controller-wide flag - a flag shared across runs would let a stale run's
 *  finish() slip through (or a live run's get skipped) if cancel() and a fresh
 *  start() race each other, since a boolean reset by the new run would silently
 *  un-cancel the old one's in-flight finalize callback. */
interface RunToken {
  canceled: boolean
}

export class ConversionController {
  private snapshot: ConversionSnapshot = EMPTY_SNAPSHOT
  private readonly listeners = new Set<() => void>()
  private unsubscribeScheduler: (() => void) | null = null
  private currentRunToken: RunToken | null = null
  /** Only ever overridden in tests, the same reasoning batchScheduler.ts's own
   *  header comment gives: real Workers aren't available in jsdom. Production
   *  code gets BatchScheduler's real default by leaving this undefined. */
  private readonly createConverter: (() => JobConverter) | undefined

  constructor(createConverter?: () => JobConverter) {
    this.createConverter = createConverter
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): ConversionSnapshot => this.snapshot

  private setSnapshot(next: ConversionSnapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  /**
   * Ported from AppState.chooseDestinationAndConvert: prompts for a destination,
   * then kicks off the batch, writing each result as it settles. Resolves false
   * if the user canceled the destination picker - the caller (App.tsx) should stay
   * on the setup screen in that case, same as the Mac app's early `guard` return.
   */
  async start(
    files: readonly AudioFile[],
    settings: ConversionSettings,
  ): Promise<boolean> {
    const destination = await OutputDestination.choose(files.length)
    if (!destination) return false

    const outputPaths = resolveOutputPaths(
      files.map((f) => f.relativePath),
      settings.codec,
    )
    const scheduler = new BatchScheduler({
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
      codecLabel: CODECS[settings.codec].label,
      finalized: false,
      finishError: null,
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

  /** ConvertView.swift's cancelAndReturnToSetup half - stops in-flight work. The
   *  screen switch and "file list intact" guarantee are App.tsx's job: this
   *  controller never touches FileIntakeStore. */
  cancel(): void {
    if (this.currentRunToken) this.currentRunToken.canceled = true
    this.snapshot.scheduler?.cancel()
  }

  /** AppState.convertMore(): drops this run's scheduler/destination so the next
   *  start() begins clean. Clearing the file list is the caller's job. */
  reset(): void {
    this.unsubscribeScheduler?.()
    this.unsubscribeScheduler = null
    this.setSnapshot(EMPTY_SNAPSHOT)
  }

  async revealDestination(): Promise<void> {
    await this.snapshot.destination?.revealDestination()
  }
}
