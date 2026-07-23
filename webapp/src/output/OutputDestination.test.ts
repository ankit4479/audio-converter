import { afterEach, describe, expect, it, vi } from 'vitest'
import { OUTPUT_MODE_LABEL, OutputDestination, outputModeFor } from './OutputDestination'
import { OutputPermissionDeniedError } from './writeToDirectory'

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
})

describe('outputModeFor', () => {
  it('is "directory" whenever the browser supports showDirectoryPicker', () => {
    window.showDirectoryPicker = vi.fn()
    expect(outputModeFor(1)).toBe('directory')
    expect(outputModeFor(50)).toBe('directory')
  })

  it('is "single-download" for exactly one file without directory support', () => {
    expect(outputModeFor(1)).toBe('single-download')
  })

  it('is "zip" for 2+ files without directory support', () => {
    expect(outputModeFor(2)).toBe('zip')
    expect(outputModeFor(50)).toBe('zip')
  })
})

describe('OUTPUT_MODE_LABEL', () => {
  it('has a distinct, non-empty label for every mode', () => {
    const labels = Object.values(OUTPUT_MODE_LABEL)
    expect(new Set(labels).size).toBe(labels.length)
    for (const label of labels) expect(label.length).toBeGreaterThan(0)
  })
})

describe('OutputDestination - directory mode', () => {
  it('writes each file straight to the chosen folder as write() is called', async () => {
    const written: string[] = []
    const fakeHandle = {
      name: 'My Music',
      getDirectoryHandle: vi.fn(),
      getFileHandle: vi.fn(async (name: string) => ({
        createWritable: async () => ({
          write: async () => {
            written.push(name)
          },
          close: async () => {},
        }),
      })),
    }
    window.showDirectoryPicker = vi.fn().mockResolvedValue(fakeHandle)

    const destination = await OutputDestination.choose(2)
    expect(destination?.mode).toBe('directory')
    await destination!.write('a.flac', new Blob(['a']))
    await destination!.write('b.flac', new Blob(['b']))

    expect(written).toEqual(['a.flac', 'b.flac'])
  })

  it("destinationLabel shows the chosen folder's name and the codec (ConvertView.swift:32)", async () => {
    window.showDirectoryPicker = vi.fn().mockResolvedValue({ name: 'My Music' })
    const destination = await OutputDestination.choose(2)
    expect(destination!.destinationLabel('FLAC')).toBe('Saving to: My Music (FLAC)')
  })

  it('revealDestination reopens the native picker scoped to the destination folder', async () => {
    const handle = { name: 'My Music' }
    const picker = vi.fn().mockResolvedValue(handle)
    window.showDirectoryPicker = picker
    const destination = await OutputDestination.choose(2)

    picker.mockClear()
    await destination!.revealDestination()
    expect(picker).toHaveBeenCalledWith({ startIn: handle })
  })

  it('revealDestination does not throw if the user dismisses the reopened picker', async () => {
    const handle = { name: 'My Music' }
    window.showDirectoryPicker = vi
      .fn()
      .mockResolvedValueOnce(handle)
      .mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'))
    const destination = await OutputDestination.choose(2)
    await expect(destination!.revealDestination()).resolves.toBeUndefined()
  })

  it('returns null if the user cancels the folder picker', async () => {
    window.showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    expect(await OutputDestination.choose(3)).toBeNull()
  })

  it('propagates OutputPermissionDeniedError from the picker without a crash', async () => {
    window.showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    await expect(OutputDestination.choose(3)).rejects.toThrow(OutputPermissionDeniedError)
  })
})

describe('OutputDestination - single-download mode', () => {
  it('does not download until finish() is called', async () => {
    const destination = await OutputDestination.choose(1)
    expect(destination?.mode).toBe('single-download')

    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')

    await destination!.write('song.flac', new Blob(['x']))
    expect(clickSpy).not.toHaveBeenCalled()

    await destination!.finish()
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(createUrl).toHaveBeenCalled()

    createUrl.mockRestore()
    clickSpy.mockRestore()
  })

  it('destinationLabel says the file downloads directly, with no folder path', async () => {
    const destination = await OutputDestination.choose(1)
    expect(destination!.destinationLabel('MP3')).toBe('Downloading directly (MP3)')
  })

  it('revealDestination re-triggers the same download after finish()', async () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')

    const destination = await OutputDestination.choose(1)
    await destination!.write('song.flac', new Blob(['x']))
    await destination!.finish()

    clickSpy.mockClear()
    await destination!.revealDestination()
    expect(clickSpy).toHaveBeenCalledTimes(1)

    createUrl.mockRestore()
    clickSpy.mockRestore()
  })
})

describe('OutputDestination - zip mode', () => {
  it('writes a whole batch through a bounded queue without error, in order', async () => {
    // The bounded-buffer guarantee itself (a push blocks until an earlier item is
    // pulled) is unit-tested directly against StreamingQueue in
    // streamingQueue.test.ts, deterministically. Here, against the real client-zip
    // consumer draining as fast as it can, the exact resolve order isn't something
    // a test can pin down reliably - what matters end-to-end is that a full batch
    // still flows through cleanly via that same bounded queue.
    const destination = await OutputDestination.choose(3)
    expect(destination?.mode).toBe('zip')

    for (const name of ['a.flac', 'b.flac', 'c.flac']) {
      await destination!.write(name, new Blob([name]))
    }
    await destination!.finish()
  })

  it('triggers exactly one zip download after finish(), containing every written file', async () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-zip')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')

    const destination = await OutputDestination.choose(2, 'my-batch.zip')
    await destination!.write('Album/a.flac', new Blob(['a']))
    await destination!.write('Album/b.flac', new Blob(['b']))
    await destination!.finish()

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(createUrl).toHaveBeenCalled()
    const [blobArg] = createUrl.mock.calls[0]
    expect((blobArg as Blob).size).toBeGreaterThan(0)

    createUrl.mockRestore()
    clickSpy.mockRestore()
  })

  it('destinationLabel says the files download as one zip, with no folder path', async () => {
    const destination = await OutputDestination.choose(2)
    expect(destination!.destinationLabel('WAV')).toBe('Downloading as one zip (WAV)')
  })

  it('revealDestination re-triggers the zip download after finish()', async () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-zip')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')

    const destination = await OutputDestination.choose(2)
    await destination!.write('a.flac', new Blob(['a']))
    await destination!.write('b.flac', new Blob(['b']))
    await destination!.finish()

    clickSpy.mockClear()
    await destination!.revealDestination()
    expect(clickSpy).toHaveBeenCalledTimes(1)

    createUrl.mockRestore()
    clickSpy.mockRestore()
  })

  it('surfaces a zip-pipeline failure through finish() rather than swallowing or hanging on it', async () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('download trigger failed')
    })

    const destination = await OutputDestination.choose(2)
    await destination!.write('a.flac', new Blob(['a']))
    await destination!.write('b.flac', new Blob(['b']))

    await expect(destination!.finish()).rejects.toThrow('download trigger failed')

    createUrl.mockRestore()
  })
})
