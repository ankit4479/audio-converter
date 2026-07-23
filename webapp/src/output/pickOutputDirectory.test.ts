import { afterEach, describe, expect, it, vi } from 'vitest'
import { OutputPermissionDeniedError } from './writeToDirectory'
import { pickOutputDirectory, supportsDirectoryOutput } from './pickOutputDirectory'

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
})

describe('supportsDirectoryOutput', () => {
  it('is false when showDirectoryPicker does not exist (Safari, Firefox)', () => {
    expect(supportsDirectoryOutput()).toBe(false)
  })

  it('is true when showDirectoryPicker exists (Chrome, Edge)', () => {
    window.showDirectoryPicker = vi.fn()
    expect(supportsDirectoryOutput()).toBe(true)
  })
})

describe('pickOutputDirectory', () => {
  it('returns null when unsupported', async () => {
    expect(await pickOutputDirectory()).toBeNull()
  })

  it("requests readwrite mode, matching AppState's destination-folder prompt", async () => {
    const handle = {} as FileSystemDirectoryHandle
    const picker = vi.fn().mockResolvedValue(handle)
    window.showDirectoryPicker = picker
    expect(await pickOutputDirectory()).toBe(handle)
    expect(picker).toHaveBeenCalledWith({ mode: 'readwrite' })
  })

  it('returns null (not an error) when the user cancels the picker', async () => {
    window.showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    expect(await pickOutputDirectory()).toBeNull()
  })

  it('throws OutputPermissionDeniedError when access is denied', async () => {
    window.showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    await expect(pickOutputDirectory()).rejects.toThrow(OutputPermissionDeniedError)
  })
})
