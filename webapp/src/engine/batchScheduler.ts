/**
 * Ported from ConversionEngine.swift: a worker pool that runs a batch of
 * conversions at bounded concurrency, tracks per-job state, and exposes the same
 * counts/ETA/cancel semantics the Mac app does.
 *
 * Takes a `createConverter` factory rather than depending on engine/converter.ts's
 * Converter directly, the same reasoning convert.test.ts gives for testing
 * convertFile instead of Converter: real Workers aren't available in jsdom, so
 * scheduling, cancellation, and error-handling need to be testable against a fake
 * without spinning one up. `defaultConverterFactory` below is what production code
 * actually gets by not passing this option.
 */
import type { AudioFile } from '../intake/audioFile'
import type { ConversionSettings } from './codec'
import { Converter } from './converter'
import {
  decodeConversionError,
  isEncodedConversionError,
  type ConversionErrorReason,
  type ConvertResult,
} from './convert'

export type JobStatus =
  | { kind: 'pending' }
  | { kind: 'running' }
  | { kind: 'done'; result: ConvertResult }
  | { kind: 'failed'; reason: string }

export interface BatchJob {
  readonly id: string
  readonly file: AudioFile
  readonly status: JobStatus
}

export interface BatchSnapshot {
  readonly jobs: readonly BatchJob[]
  readonly isRunning: boolean
}

export interface JobConverter {
  convert(
    file: Blob,
    baseName: string,
    settings: ConversionSettings,
    options: { signal?: AbortSignal },
  ): Promise<ConvertResult>
  dispose(): void
}

export interface BatchSchedulerOptions {
  concurrency?: number
  createConverter?: () => JobConverter
  /** Called once a job settles (done or failed), before its worker slot picks up
   *  the next job. The batch's caller - not BatchScheduler - owns writing the
   *  result to disk (issue #10's OutputDestination); this is just the hook. */
  onJobSettled?: (job: BatchJob) => void | Promise<void>
}

function defaultConverterFactory(): JobConverter {
  return new Converter()
}

// ConversionEngine.swift:32
export function defaultConcurrency(): number {
  const cores =
    typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined
  return Math.min(Math.max((cores ?? 4) - 2, 2), 8)
}

// ConversionEngine.swift:216-224
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) return 'less than a minute left'
  if (minutes === 1) return 'about 1 minute left'
  if (minutes < 60) return `about ${minutes} minutes left`
  const hours = Math.floor(minutes / 60)
  return `about ${hours}h ${minutes % 60}m left`
}

const REASON_MESSAGE: Readonly<Record<ConversionErrorReason, string>> = {
  'no-audio-track': 'no audio track found',
  unreadable: 'file could not be read',
  'not-implemented': 'unsupported or corrupted file',
  'unsupported-in-browser': 'unsupported or corrupted file',
  canceled: 'conversion was canceled',
  unknown: 'conversion failed',
}

// ConversionEngine.swift:168-177, adapted from stderr string-matching to our typed
// ConversionErrorReason (see convert.ts's own header comment for why the browser
// engine reports errors that way instead).
export function simplifiedErrorReason(error: unknown): string {
  if (error instanceof Error && error.name === 'OutputPermissionDeniedError') {
    return 'permission denied'
  }
  if (isEncodedConversionError(error)) {
    return REASON_MESSAGE[decodeConversionError(error).reason]
  }
  return error instanceof Error && error.message ? error.message : 'conversion failed'
}

function baseNameFor(relativePath: string): string {
  const fileName = relativePath.slice(relativePath.lastIndexOf('/') + 1)
  const lastDot = fileName.lastIndexOf('.')
  return lastDot <= 0 ? fileName : fileName.slice(0, lastDot)
}

export class BatchScheduler {
  private jobs: BatchJob[] = []
  private isRunning = false
  private startedAt: number | null = null
  private cancelRequested = false
  private readonly listeners = new Set<() => void>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly concurrency: number
  private readonly createConverter: () => JobConverter
  private readonly onJobSettled?: (job: BatchJob) => void | Promise<void>

  constructor(options: BatchSchedulerOptions = {}) {
    this.concurrency = options.concurrency ?? defaultConcurrency()
    this.createConverter = options.createConverter ?? defaultConverterFactory
    this.onJobSettled = options.onJobSettled
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): BatchSnapshot => ({ jobs: this.jobs, isRunning: this.isRunning })

  get totalCount(): number {
    return this.jobs.length
  }

  get completedCount(): number {
    return this.jobs.filter((job) => job.status.kind === 'done').length
  }

  get failedJobs(): readonly BatchJob[] {
    return this.jobs.filter((job) => job.status.kind === 'failed')
  }

  get isFinished(): boolean {
    return (
      !this.isRunning &&
      this.jobs.length > 0 &&
      this.completedCount + this.failedJobs.length === this.totalCount
    )
  }

  get currentFileNames(): readonly string[] {
    return this.jobs
      .filter((job) => job.status.kind === 'running')
      .map((job) => job.file.displayName)
      .sort()
  }

  get estimatedTimeRemainingLabel(): string | null {
    if (this.startedAt === null || this.completedCount === 0 || !this.isRunning)
      return null
    const elapsedSeconds = (Date.now() - this.startedAt) / 1000
    const perFile = elapsedSeconds / this.completedCount
    const remainingFiles = Math.max(
      this.totalCount - this.completedCount - this.failedJobs.length,
      0,
    )
    return formatDuration(perFile * remainingFiles)
  }

  async run(files: readonly AudioFile[], settings: ConversionSettings): Promise<void> {
    this.jobs = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: { kind: 'pending' as const },
    }))
    if (this.jobs.length === 0) return

    this.isRunning = true
    this.startedAt = Date.now()
    this.cancelRequested = false
    this.notify()

    let nextIndex = 0
    const claimNext = (): number | null => {
      if (nextIndex >= this.jobs.length) return null
      const index = nextIndex
      nextIndex += 1
      return index
    }

    const runWorkerSlot = async (): Promise<void> => {
      const converter = this.createConverter()
      try {
        while (!this.cancelRequested) {
          const index = claimNext()
          if (index === null) return
          await this.runJob(index, converter, settings)
        }
      } finally {
        converter.dispose()
      }
    }

    const workerCount = Math.min(this.concurrency, this.jobs.length)
    await Promise.all(Array.from({ length: workerCount }, () => runWorkerSlot()))

    // Jobs no worker slot ever reached (cancel() fired before they were claimed)
    // are still 'pending' - mark them failed too, so totals stay consistent.
    this.jobs = this.jobs.map((job) =>
      job.status.kind === 'pending'
        ? { ...job, status: { kind: 'failed', reason: 'cancelled before it started' } }
        : job,
    )

    this.isRunning = false
    this.notify()
  }

  private async runJob(
    index: number,
    converter: JobConverter,
    settings: ConversionSettings,
  ): Promise<void> {
    if (this.cancelRequested) {
      this.setJob(index, { kind: 'failed', reason: 'cancelled before it started' })
      return
    }

    const job = this.jobs[index]
    this.setJob(index, { kind: 'running' })

    const controller = new AbortController()
    this.controllers.set(job.id, controller)
    try {
      const result = await converter.convert(
        job.file.file,
        baseNameFor(job.file.relativePath),
        settings,
        { signal: controller.signal },
      )
      this.setJob(index, { kind: 'done', result })
    } catch (error) {
      this.setJob(index, { kind: 'failed', reason: simplifiedErrorReason(error) })
    } finally {
      this.controllers.delete(job.id)
    }

    // A caller's settle hook (typically writing the result to disk via
    // OutputDestination) can throw for real - a revoked folder permission mid-batch,
    // say - and "one file failing never stops the batch" has to hold here too, not
    // just for convert() itself. Left unguarded, that throw would escape runJob,
    // reject run()'s Promise.all, and abandon every other in-flight/unclaimed job
    // mid-run with inconsistent state (some still 'pending' forever, isRunning stuck
    // true). Demoting the job to 'failed' here is also what actually makes the
    // "permission denied" reason reachable in practice, since OutputPermissionDeniedError
    // only ever comes from this hook, never from convert() itself.
    if (this.onJobSettled) {
      try {
        await this.onJobSettled(this.jobs[index])
      } catch (error) {
        this.setJob(index, { kind: 'failed', reason: simplifiedErrorReason(error) })
      }
    }
  }

  /** Stops launching new jobs and terminates whatever is currently running. Jobs
   *  that never got picked up are marked failed once run() winds down, so the
   *  totals stay consistent (ConversionEngine.swift's cancel() contract). */
  cancel(): void {
    this.cancelRequested = true
    for (const controller of this.controllers.values()) controller.abort()
  }

  private setJob(index: number, status: JobStatus): void {
    this.jobs = this.jobs.map((job, i) => (i === index ? { ...job, status } : job))
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
