import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScannedFile } from './audioFile'

// Controlled by each test: lets us resolve duration scans in a specific order to
// exercise the generation guard deterministically, rather than racing real timers.
const pendingDurations: { resolve: (n: number) => void }[] = []
vi.mock('./duration', () => ({
  totalDuration: vi.fn(
    () =>
      new Promise<number>((resolve) => {
        pendingDurations.push({ resolve })
      }),
  ),
}))

const { FileIntakeStore } = await import('./FileIntakeStore')

function scanned(name: string, relativePath = name): ScannedFile {
  return { file: new File(['x'], name), relativePath }
}

beforeEach(() => {
  pendingDurations.length = 0
})

describe('FileIntakeStore.addFiles', () => {
  it('adds new files and starts a duration scan', () => {
    const store = new FileIntakeStore()
    store.addFiles([scanned('a.mp3'), scanned('b.mp3')])
    const snap = store.getSnapshot()
    expect(snap.files.map((f) => f.displayName)).toEqual(['a.mp3', 'b.mp3'])
    expect(snap.isCalculatingDuration).toBe(true)
  })

  it('ignores an empty or all-non-audio batch without notifying or starting a scan', () => {
    const store = new FileIntakeStore()
    let notified = false
    store.subscribe(() => {
      notified = true
    })
    store.addFiles([scanned('cover.jpg')])
    expect(notified).toBe(false)
    expect(store.getSnapshot().files).toHaveLength(0)
  })

  it('deduplicates against already-added files (dropping the same folder twice)', () => {
    const store = new FileIntakeStore()
    store.addFiles([scanned('a.mp3', 'Album/a.mp3'), scanned('b.mp3', 'Album/b.mp3')])
    store.addFiles([scanned('a.mp3', 'Album/a.mp3'), scanned('b.mp3', 'Album/b.mp3')])
    expect(store.getSnapshot().files).toHaveLength(2)
  })

  it('notifies subscribers when files are added', () => {
    const store = new FileIntakeStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.addFiles([scanned('a.mp3')])
    expect(listener).toHaveBeenCalled()
  })
})

describe('FileIntakeStore duration generation guard', () => {
  it('a stale duration scan started before more files were added does not overwrite the newer result', async () => {
    // Regression coverage for AppState.recalculateDuration's exact race: adding
    // files while a scan is in flight must not let the OLD scan's result win when
    // it resolves after the NEW one.
    const store = new FileIntakeStore()

    store.addFiles([scanned('a.mp3')]) // starts scan #1
    expect(pendingDurations).toHaveLength(1)

    store.addFiles([scanned('b.mp3')]) // starts scan #2, #1 is now stale
    expect(pendingDurations).toHaveLength(2)

    // Resolve the stale scan (#1) AFTER the newer one (#2) - if the guard didn't
    // work, this stale 111 would clobber the correct, later value.
    pendingDurations[1].resolve(222) // #2 (current) resolves first
    await Promise.resolve()
    await Promise.resolve()
    expect(store.getSnapshot().totalDuration).toBe(222)
    expect(store.getSnapshot().isCalculatingDuration).toBe(false)

    pendingDurations[0].resolve(111) // #1 (stale) resolves after - must be ignored
    await Promise.resolve()
    await Promise.resolve()
    expect(store.getSnapshot().totalDuration).toBe(222)
  })
})

describe('FileIntakeStore.clear', () => {
  it('resets files, duration, and the calculating flag', () => {
    const store = new FileIntakeStore()
    store.addFiles([scanned('a.mp3')])
    store.clear()
    const snap = store.getSnapshot()
    expect(snap.files).toHaveLength(0)
    expect(snap.totalDuration).toBe(0)
    expect(snap.isCalculatingDuration).toBe(false)
  })

  it('a duration scan in flight when clear() is called cannot resurrect files after clearing', async () => {
    const store = new FileIntakeStore()
    store.addFiles([scanned('a.mp3')])
    store.clear()
    pendingDurations[0]?.resolve(999)
    await Promise.resolve()
    await Promise.resolve()
    expect(store.getSnapshot().totalDuration).toBe(0)
  })
})
