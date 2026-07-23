import { describe, expect, it, vi } from 'vitest'
import type { AudioFile } from '../intake/audioFile'
import {
  BatchScheduler,
  defaultConcurrency,
  formatDuration,
  simplifiedErrorReason,
  type BatchJob,
  type JobConverter,
} from './batchScheduler'
import { ConversionError } from './convert'

function audioFile(name: string): AudioFile {
  return {
    id: name,
    file: new File(['x'], name),
    relativePath: name,
    fileSize: 1,
    displayName: name,
  }
}

const SETTINGS = {
  codec: 'flac' as const,
  quality: 'best' as const,
  compression: 'balanced' as const,
  sampleRate: 'keepOriginal' as const,
  keepMetadata: true,
}

/** A controllable fake JobConverter: convert() doesn't resolve until the test
 *  explicitly releases it, so concurrency and cancellation can be observed rather
 *  than raced against real timing. */
function makeControllableConverterFactory() {
  const pending = new Map<
    string,
    {
      resolve: (r: { blob: Blob; fileName: string }) => void
      reject: (e: unknown) => void
    }
  >()
  let activeCount = 0
  let maxActive = 0
  const disposed: boolean[] = []

  const createConverter = (): JobConverter => {
    disposed.push(false)
    const slot = disposed.length - 1
    return {
      convert: (_file, baseName, _settings, options) => {
        activeCount += 1
        maxActive = Math.max(maxActive, activeCount)
        return new Promise((resolve, reject) => {
          pending.set(baseName, {
            resolve: (r) => {
              activeCount -= 1
              resolve(r)
            },
            reject: (e) => {
              activeCount -= 1
              reject(e)
            },
          })
          options.signal?.addEventListener('abort', () => {
            activeCount -= 1
            reject(new ConversionError('canceled', 'Conversion was canceled.'))
          })
        })
      },
      dispose: () => {
        disposed[slot] = true
      },
    }
  }

  return {
    createConverter,
    hasPending: (baseName: string) => pending.has(baseName),
    release: (
      baseName: string,
      result = { blob: new Blob(['x']), fileName: baseName },
    ) => {
      pending.get(baseName)?.resolve(result)
      pending.delete(baseName)
    },
    fail: (baseName: string, error: unknown) => {
      pending.get(baseName)?.reject(error)
      pending.delete(baseName)
    },
    get maxActive() {
      return maxActive
    },
    get allDisposed() {
      return disposed.every(Boolean)
    },
  }
}

describe('formatDuration (ConversionEngine.swift:216-224)', () => {
  it('says "less than a minute left" under 60 seconds', () => {
    expect(formatDuration(30)).toBe('less than a minute left')
  })

  it('says "about 1 minute left" for exactly one minute', () => {
    expect(formatDuration(60)).toBe('about 1 minute left')
  })

  it('says "about N minutes left" for multiple minutes under an hour', () => {
    expect(formatDuration(12 * 60)).toBe('about 12 minutes left')
  })

  it('says "about Xh Ym left" for an hour or more', () => {
    expect(formatDuration(80 * 60)).toBe('about 1h 20m left')
  })
})

describe('defaultConcurrency (ConversionEngine.swift:32)', () => {
  it('is min(max(cores - 2, 2), 8)', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 16 })
    expect(defaultConcurrency()).toBe(8)
    vi.stubGlobal('navigator', { hardwareConcurrency: 4 })
    expect(defaultConcurrency()).toBe(2)
    vi.stubGlobal('navigator', { hardwareConcurrency: 1 })
    expect(defaultConcurrency()).toBe(2)
    vi.unstubAllGlobals()
  })
})

describe('simplifiedErrorReason', () => {
  it('maps a no-audio-track ConversionError to "no audio track found"', () => {
    expect(simplifiedErrorReason(new ConversionError('no-audio-track', 'x'))).toBe(
      'no audio track found',
    )
  })

  it('maps an unreadable ConversionError to "file could not be read"', () => {
    expect(simplifiedErrorReason(new ConversionError('unreadable', 'x'))).toBe(
      'file could not be read',
    )
  })

  it('maps OutputPermissionDeniedError-shaped errors to "permission denied"', () => {
    const error = new Error('denied')
    error.name = 'OutputPermissionDeniedError'
    expect(simplifiedErrorReason(error)).toBe('permission denied')
  })

  it('falls back to the raw message for an unrecognized error', () => {
    expect(simplifiedErrorReason(new Error('disk on fire'))).toBe('disk on fire')
  })
})

describe('BatchScheduler - concurrency', () => {
  it('runs a large batch at the configured concurrency, never exceeding it', async () => {
    const fake = makeControllableConverterFactory()
    const scheduler = new BatchScheduler({
      concurrency: 3,
      createConverter: fake.createConverter,
    })

    const files = Array.from({ length: 10 }, (_, i) => audioFile(`f${i}.wav`))
    const run = scheduler.run(files, SETTINGS)

    // Release each file only once it's actually started converting, so a slot
    // freeing up lets the next file start before it too is released - otherwise
    // an upfront "release everything" would no-op on files 3-9, which haven't
    // called convert() yet when release() is called.
    for (let i = 0; i < 10; i++) {
      await vi.waitFor(() => expect(fake.hasPending(`f${i}`)).toBe(true))
      fake.release(`f${i}`)
    }
    await run

    expect(fake.maxActive).toBe(3)
    expect(scheduler.completedCount).toBe(10)
    expect(scheduler.isFinished).toBe(true)
  })

  it('a 100 file batch runs at the expected concurrency, instrumented via active job count', async () => {
    const fake = makeControllableConverterFactory()
    const concurrency = 6
    const scheduler = new BatchScheduler({
      concurrency,
      createConverter: fake.createConverter,
    })

    const files = Array.from({ length: 100 }, (_, i) => audioFile(`f${i}.wav`))
    const run = scheduler.run(files, SETTINGS)

    for (let i = 0; i < 100; i++) {
      await vi.waitFor(() => expect(fake.hasPending(`f${i}`)).toBe(true))
      fake.release(`f${i}`)
    }
    await run

    expect(fake.maxActive).toBe(concurrency)
    expect(scheduler.completedCount).toBe(100)
    expect(scheduler.isFinished).toBe(true)
    expect(fake.allDisposed).toBe(true)
  })
})

describe('BatchScheduler - error isolation', () => {
  it('a failed file does not stop the rest of the batch', async () => {
    const fake = makeControllableConverterFactory()
    const scheduler = new BatchScheduler({
      concurrency: 3,
      createConverter: fake.createConverter,
    })

    const files = [audioFile('good1.wav'), audioFile('bad.wav'), audioFile('good2.wav')]
    const run = scheduler.run(files, SETTINGS)

    await vi.waitFor(() => expect(fake.maxActive).toBe(3))
    fake.fail('bad', new ConversionError('unreadable', 'corrupt'))
    fake.release('good1')
    fake.release('good2')
    await run

    expect(scheduler.completedCount).toBe(2)
    expect(scheduler.failedJobs).toHaveLength(1)
    expect(scheduler.failedJobs[0]?.status).toEqual({
      kind: 'failed',
      reason: 'file could not be read',
    })
    expect(scheduler.isFinished).toBe(true)
  })
})

describe('BatchScheduler - cancel', () => {
  it('stops launching new jobs, terminates in-flight ones, and marks unstarted jobs cancelled', async () => {
    const fake = makeControllableConverterFactory()
    const scheduler = new BatchScheduler({
      concurrency: 2,
      createConverter: fake.createConverter,
    })

    const files = Array.from({ length: 5 }, (_, i) => audioFile(`f${i}.wav`))
    const run = scheduler.run(files, SETTINGS)

    await vi.waitFor(() => expect(fake.maxActive).toBe(2))
    scheduler.cancel()
    await run

    expect(scheduler.isFinished).toBe(true)
    expect(scheduler.completedCount + scheduler.failedJobs.length).toBe(5)
    // The 3 jobs that never got a worker slot must be marked failed too, not left
    // dangling as 'pending' forever.
    const unstarted = scheduler.failedJobs.filter(
      (j) =>
        j.status.kind === 'failed' && j.status.reason === 'cancelled before it started',
    )
    expect(unstarted.length).toBeGreaterThanOrEqual(3)
    expect(fake.allDisposed).toBe(true)
  })
})

describe('BatchScheduler - onJobSettled', () => {
  it('is called once per settled job, after its status updates', async () => {
    const fake = makeControllableConverterFactory()
    const settled: BatchJob['status'][] = []
    const scheduler = new BatchScheduler({
      concurrency: 2,
      createConverter: fake.createConverter,
      onJobSettled: (job) => {
        settled.push(job.status)
      },
    })

    const files = [audioFile('a.wav'), audioFile('b.wav')]
    const run = scheduler.run(files, SETTINGS)
    await vi.waitFor(() => expect(fake.maxActive).toBe(2))
    fake.release('a')
    fake.release('b')
    await run

    expect(settled).toHaveLength(2)
    expect(settled.every((s) => s.kind === 'done')).toBe(true)
  })

  it('demotes a job to failed, without crashing the batch, if the settle hook itself throws', async () => {
    // Simulates the real shape of this failure: the settle hook writes the
    // converted result to disk (OutputDestination.write), which can throw an
    // OutputPermissionDeniedError for a reason that has nothing to do with
    // conversion itself - the file already converted fine.
    const fake = makeControllableConverterFactory()
    const permissionError = new Error('denied')
    permissionError.name = 'OutputPermissionDeniedError'

    const scheduler = new BatchScheduler({
      concurrency: 2,
      createConverter: fake.createConverter,
      onJobSettled: (job) => {
        if (job.file.displayName === 'bad.wav') throw permissionError
      },
    })

    const files = [audioFile('good.wav'), audioFile('bad.wav')]
    const run = scheduler.run(files, SETTINGS)
    await vi.waitFor(() => expect(fake.maxActive).toBe(2))
    fake.release('good')
    fake.release('bad')
    await run

    expect(scheduler.isFinished).toBe(true)
    expect(scheduler.completedCount).toBe(1)
    expect(scheduler.failedJobs).toHaveLength(1)
    expect(scheduler.failedJobs[0]?.status).toEqual({
      kind: 'failed',
      reason: 'permission denied',
    })
  })
})

describe('BatchScheduler - ETA', () => {
  it('is null before any file has completed', async () => {
    const fake = makeControllableConverterFactory()
    const scheduler = new BatchScheduler({
      concurrency: 1,
      createConverter: fake.createConverter,
    })
    const run = scheduler.run([audioFile('a.wav')], SETTINGS)
    await vi.waitFor(() => expect(fake.maxActive).toBe(1))
    expect(scheduler.estimatedTimeRemainingLabel).toBeNull()
    fake.release('a')
    await run
  })

  it('is null once the batch has finished running', async () => {
    const fake = makeControllableConverterFactory()
    const scheduler = new BatchScheduler({
      concurrency: 1,
      createConverter: fake.createConverter,
    })
    const run = scheduler.run([audioFile('a.wav')], SETTINGS)
    await vi.waitFor(() => expect(fake.maxActive).toBe(1))
    fake.release('a')
    await run
    expect(scheduler.estimatedTimeRemainingLabel).toBeNull()
  })
})

describe('BatchScheduler - empty batch', () => {
  it('finishes immediately with no jobs', async () => {
    const fake = makeControllableConverterFactory()
    const scheduler = new BatchScheduler({ createConverter: fake.createConverter })
    await scheduler.run([], SETTINGS)
    expect(scheduler.totalCount).toBe(0)
    expect(scheduler.isFinished).toBe(false)
  })
})
