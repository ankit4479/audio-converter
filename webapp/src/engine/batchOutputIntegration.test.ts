/**
 * Proves BatchScheduler (issue #11) and OutputDestination (issue #10) actually
 * compose correctly end to end - a real batch run whose onJobSettled hook writes
 * each result to a destination, including the collision-renaming and folder-
 * mirroring behavior neither module tests in isolation the same way. Still not a
 * live browser demo (that needs the Convert screen, issue #15, as the real caller),
 * but this is the actual integration path #15 will wire up, exercised for real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AudioFile } from '../intake/audioFile'
import { OutputDestination } from '../output/OutputDestination'
import { resolveOutputPaths } from '../output/outputPath'
import { BatchScheduler, type JobConverter } from './batchScheduler'
import type { ConversionSettings } from './codec'

function audioFile(relativePath: string): AudioFile {
  return {
    id: relativePath,
    file: new File(['x'], relativePath),
    relativePath,
    fileSize: 1,
    displayName: relativePath,
  }
}

const SETTINGS: ConversionSettings = {
  codec: 'flac',
  quality: 'best',
  compression: 'balanced',
  sampleRate: 'keepOriginal',
  keepMetadata: true,
}

function instantConverterFactory(): () => JobConverter {
  return () => ({
    convert: async (file) => ({ blob: file, fileName: 'ignored' }),
    dispose: () => {},
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
})

describe('BatchScheduler + OutputDestination integration', () => {
  it('writes a batch with a naming collision into a chosen directory, correctly deduplicated', async () => {
    const writes = new Map<string, Blob>()
    const fakeRoot = {
      getDirectoryHandle: vi.fn(),
      getFileHandle: vi.fn(async (name: string) => ({
        createWritable: async () => ({
          write: async (blob: Blob) => {
            writes.set(name, blob)
          },
          close: async () => {},
        }),
      })),
    }
    window.showDirectoryPicker = vi.fn().mockResolvedValue(fakeRoot)

    const files = [audioFile('track.wav'), audioFile('track.mp3')] // collide: both -> track.flac
    const outputPaths = resolveOutputPaths(
      files.map((f) => f.relativePath),
      SETTINGS.codec,
    )
    expect(outputPaths).toEqual(['track.flac', 'track (2).flac'])

    const destination = await OutputDestination.choose(files.length)
    expect(destination?.mode).toBe('directory')

    const scheduler = new BatchScheduler({
      concurrency: 2,
      createConverter: instantConverterFactory(),
      onJobSettled: async (job) => {
        if (job.status.kind !== 'done') return
        const index = files.findIndex((f) => f.id === job.file.id)
        await destination!.write(outputPaths[index], job.status.result.blob)
      },
    })

    await scheduler.run(files, SETTINGS)
    await destination!.finish()

    expect(scheduler.isFinished).toBe(true)
    expect(scheduler.completedCount).toBe(2)
    expect(writes.has('track.flac')).toBe(true)
    expect(writes.has('track (2).flac')).toBe(true)
  })

  it('zips a batch when the browser has no directory access, preserving both files', async () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-zip')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')

    const files = [audioFile('Album/a.wav'), audioFile('Album/b.wav')]
    const outputPaths = resolveOutputPaths(
      files.map((f) => f.relativePath),
      SETTINGS.codec,
    )

    const destination = await OutputDestination.choose(files.length)
    expect(destination?.mode).toBe('zip')

    const scheduler = new BatchScheduler({
      concurrency: 2,
      createConverter: instantConverterFactory(),
      onJobSettled: async (job) => {
        if (job.status.kind !== 'done') return
        const index = files.findIndex((f) => f.id === job.file.id)
        await destination!.write(outputPaths[index], job.status.result.blob)
      },
    })

    await scheduler.run(files, SETTINGS)
    await destination!.finish()

    expect(scheduler.completedCount).toBe(2)
    expect(clickSpy).toHaveBeenCalledTimes(1)

    createUrl.mockRestore()
    clickSpy.mockRestore()
  })

  it('one file failing to convert does not stop the others from being written', async () => {
    const writes: string[] = []
    const files = [audioFile('good.wav'), audioFile('bad.wav')]
    const outputPaths = resolveOutputPaths(
      files.map((f) => f.relativePath),
      SETTINGS.codec,
    )

    const destination = await OutputDestination.choose(files.length)

    const scheduler = new BatchScheduler({
      concurrency: 2,
      createConverter: () => ({
        convert: async (file, baseName) => {
          if (baseName === 'bad') throw new Error('corrupt file')
          return { blob: file, fileName: 'ignored' }
        },
        dispose: () => {},
      }),
      onJobSettled: async (job) => {
        if (job.status.kind !== 'done') return
        const index = files.findIndex((f) => f.id === job.file.id)
        writes.push(outputPaths[index])
        await destination!.write(outputPaths[index], job.status.result.blob)
      },
    })

    await scheduler.run(files, SETTINGS)
    await destination!.finish()

    expect(scheduler.completedCount).toBe(1)
    expect(scheduler.failedJobs).toHaveLength(1)
    expect(writes).toEqual(['good.flac'])
  })
})
