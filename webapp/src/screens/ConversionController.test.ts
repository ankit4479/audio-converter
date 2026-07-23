import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobConverter } from '../engine/batchScheduler'
import type { AudioFile } from '../intake/audioFile'
import { ConversionController } from './ConversionController'

function audioFile(relativePath: string): AudioFile {
  return {
    id: relativePath,
    file: new File(['x'], relativePath),
    relativePath,
    fileSize: 1,
    displayName: relativePath,
  }
}

const SETTINGS = {
  codec: 'flac' as const,
  quality: 'best' as const,
  compression: 'balanced' as const,
  sampleRate: 'keepOriginal' as const,
  keepMetadata: true,
}

/** Resolves instantly - real Workers aren't available in jsdom, same reasoning
 *  batchScheduler.test.ts gives, threaded through ConversionController's own
 *  createConverter override. */
function instantConverterFactory(): () => JobConverter {
  return () => ({
    convert: async (file) => ({ blob: file, fileName: 'ignored' }),
    dispose: () => {},
  })
}

function fakeDirectoryPicker(name = 'Music') {
  return vi.fn().mockResolvedValue({
    name,
    getDirectoryHandle: vi.fn(),
    getFileHandle: vi.fn(async () => ({
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
    })),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
})

describe('ConversionController.start', () => {
  it('resolves false and leaves an empty snapshot if the destination picker is canceled', async () => {
    window.showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    const controller = new ConversionController(instantConverterFactory())

    const started = await controller.start([audioFile('a.wav')], SETTINGS)

    expect(started).toBe(false)
    expect(controller.getSnapshot().scheduler).toBeNull()
    expect(controller.getSnapshot().destination).toBeNull()
  })

  it('resolves true and populates the snapshot once a destination is chosen', async () => {
    window.showDirectoryPicker = fakeDirectoryPicker()
    const controller = new ConversionController(instantConverterFactory())
    const files = [audioFile('a.wav'), audioFile('b.wav')]

    const started = await controller.start(files, SETTINGS)

    expect(started).toBe(true)
    const snapshot = controller.getSnapshot()
    expect(snapshot.scheduler).not.toBeNull()
    expect(snapshot.destination?.mode).toBe('directory')
    expect(snapshot.codecLabel).toBe('FLAC')
  })

  it('notifies subscribers as the underlying scheduler progresses through to completion', async () => {
    window.showDirectoryPicker = fakeDirectoryPicker()
    const controller = new ConversionController(instantConverterFactory())
    let notifications = 0
    controller.subscribe(() => {
      notifications += 1
    })

    await controller.start([audioFile('a.wav')], SETTINGS)
    await vi.waitFor(() =>
      expect(controller.getSnapshot().scheduler?.isFinished).toBe(true),
    )

    expect(notifications).toBeGreaterThan(0)
  })

  it('actually writes each converted file to the chosen destination', async () => {
    const written: string[] = []
    window.showDirectoryPicker = vi.fn().mockResolvedValue({
      name: 'Music',
      getDirectoryHandle: vi.fn(),
      getFileHandle: vi.fn(async (name: string) => ({
        createWritable: async () => ({
          write: async () => {
            written.push(name)
          },
          close: async () => {},
        }),
      })),
    })
    const controller = new ConversionController(instantConverterFactory())

    await controller.start([audioFile('a.wav'), audioFile('b.wav')], SETTINGS)
    await vi.waitFor(() =>
      expect(controller.getSnapshot().scheduler?.isFinished).toBe(true),
    )

    expect(written.sort()).toEqual(['a.flac', 'b.flac'])
  })

  it('does not finalize (e.g. trigger a zip download) if the run was canceled first', async () => {
    // Simulates "Change" firing mid-batch: cancel() before the batch's own run()
    // promise settles. A canceled run must not still surprise the user with a
    // download after they've already navigated back to setup. Directory mode
    // (fakeDirectoryPicker) has no finalize step to observe, so this uses zip mode
    // instead, where finish() triggering a download is directly observable.
    const resolvers: Array<(r: { blob: Blob; fileName: string }) => void> = []
    const stallingConverter: () => JobConverter = () => ({
      convert: () => new Promise((resolve) => resolvers.push(resolve)),
      dispose: () => {},
    })
    const controller = new ConversionController(stallingConverter)

    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')

    await controller.start([audioFile('a.wav'), audioFile('b.wav')], SETTINGS)
    await vi.waitFor(() => expect(resolvers.length).toBe(2))
    controller.cancel()
    resolvers.forEach((resolve) =>
      resolve({ blob: new Blob(['x']), fileName: 'ignored' }),
    )
    await vi.waitFor(() =>
      expect(controller.getSnapshot().scheduler?.isFinished).toBe(true),
    )

    expect(clickSpy).not.toHaveBeenCalled()

    createUrl.mockRestore()
    clickSpy.mockRestore()
  })

  it('a stale canceled run does not finalize once a new run has started (no shared-flag race)', async () => {
    // Regression for a bug where cancellation was tracked on one controller-wide
    // flag: starting run B reset that shared flag, so when run A's (canceled) own
    // scheduler.run() promise finally settled afterward, it read "not canceled"
    // and finalized anyway - firing a zip download A's own cancel() was supposed
    // to have suppressed, and potentially clobbering B's live snapshot with it.
    const resolvers: Array<(r: { blob: Blob; fileName: string }) => void> = []
    const stallingConverter: () => JobConverter = () => ({
      convert: () => new Promise((resolve) => resolvers.push(resolve)),
      dispose: () => {},
    })
    const controller = new ConversionController(stallingConverter)

    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')

    // Run A: 2 files, zip mode (no directory picker configured).
    await controller.start([audioFile('a1.wav'), audioFile('a2.wav')], SETTINGS)
    const schedulerA = controller.getSnapshot().scheduler
    await vi.waitFor(() => expect(resolvers.length).toBe(2))
    controller.cancel()

    // Run B starts before A's run() promise has settled - A's two conversions are
    // still stalled, unresolved, in `resolvers`.
    const startedB = await controller.start(
      [audioFile('b1.wav'), audioFile('b2.wav')],
      SETTINGS,
    )
    expect(startedB).toBe(true)
    const schedulerB = controller.getSnapshot().scheduler
    expect(schedulerB).not.toBe(schedulerA)

    // Release everything: A's two stale conversions and B's two live ones.
    await vi.waitFor(() => expect(resolvers.length).toBe(4))
    resolvers.forEach((resolve) =>
      resolve({ blob: new Blob(['x']), fileName: 'ignored' }),
    )
    await vi.waitFor(() => expect(schedulerA?.isFinished).toBe(true))
    await vi.waitFor(() => expect(schedulerB?.isFinished).toBe(true))
    await vi.waitFor(() => expect(controller.getSnapshot().finalized).toBe(true))

    // Exactly one zip download - B's legitimate one. If A's stale finish() had
    // also fired, this would be 2, and/or B's snapshot below would have been
    // overwritten by A's finish() resolving afterward.
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().scheduler).toBe(schedulerB)
    expect(controller.getSnapshot().finishError).toBeNull()

    createUrl.mockRestore()
    clickSpy.mockRestore()
  })
})

describe('ConversionController - finalized', () => {
  it('is still false at the exact moment the scheduler reports isFinished, and becomes true once finish() actually settles', async () => {
    let resolveConvert!: (r: { blob: Blob; fileName: string }) => void
    const stallingConverter: () => JobConverter = () => ({
      convert: () => new Promise((resolve) => (resolveConvert = resolve)),
      dispose: () => {},
    })
    const controller = new ConversionController(stallingConverter)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    vi.spyOn(HTMLAnchorElement.prototype, 'click')

    await controller.start([audioFile('a.wav')], SETTINGS) // single-download mode

    let finalizedWhenFirstFinished: boolean | null = null
    controller.subscribe(() => {
      const snapshot = controller.getSnapshot()
      if (snapshot.scheduler?.isFinished && finalizedWhenFirstFinished === null) {
        finalizedWhenFirstFinished = snapshot.finalized
      }
    })

    resolveConvert({ blob: new Blob(['x']), fileName: 'ignored' })
    await vi.waitFor(() => expect(controller.getSnapshot().finalized).toBe(true))

    expect(finalizedWhenFirstFinished).toBe(false)

    vi.restoreAllMocks()
  })
})

describe('ConversionController.cancel', () => {
  it('cancels the underlying scheduler without throwing when nothing has started', () => {
    const controller = new ConversionController(instantConverterFactory())
    expect(() => controller.cancel()).not.toThrow()
  })
})

describe('ConversionController.reset', () => {
  it('clears the snapshot back to empty', async () => {
    window.showDirectoryPicker = fakeDirectoryPicker()
    const controller = new ConversionController(instantConverterFactory())
    await controller.start([audioFile('a.wav')], SETTINGS)
    expect(controller.getSnapshot().scheduler).not.toBeNull()

    controller.reset()

    expect(controller.getSnapshot().scheduler).toBeNull()
    expect(controller.getSnapshot().destination).toBeNull()
  })
})
