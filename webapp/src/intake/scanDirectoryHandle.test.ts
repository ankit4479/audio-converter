import { afterEach, describe, expect, it } from 'vitest'
import {
  pickDirectory,
  scanDirectoryHandle,
  supportsDirectoryPicker,
} from './scanDirectoryHandle'

/** jsdom doesn't implement the File System Access API at all, so this is a hand-built
 *  mock matching the one shape scanDirectoryHandle actually uses: async-iterable
 *  entries(). */
function fakeFileHandle(name: string, content = 'x'): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: () => Promise.resolve(new File([content], name)),
  } as unknown as FileSystemFileHandle
}

function fakeDirectoryHandle(
  name: string,
  children: [string, FileSystemFileHandle | FileSystemDirectoryHandle][],
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    entries: () => {
      async function* iter() {
        for (const entry of children) yield entry
      }
      return iter()
    },
  } as unknown as FileSystemDirectoryHandle
}

describe('scanDirectoryHandle', () => {
  it('prefixes every file with the picked folder name, recursively', async () => {
    const nested = fakeDirectoryHandle('Nested', [
      ['deep.mp3', fakeFileHandle('deep.mp3')],
    ])
    const root = fakeDirectoryHandle('Album', [
      ['track1.mp3', fakeFileHandle('track1.mp3')],
      ['Nested', nested],
    ])

    const result = await scanDirectoryHandle(root)
    expect(result.map((r) => r.relativePath).sort()).toEqual([
      'Album/Nested/deep.mp3',
      'Album/track1.mp3',
    ])
  })

  it('handles an empty directory', async () => {
    const root = fakeDirectoryHandle('Empty', [])
    expect(await scanDirectoryHandle(root)).toEqual([])
  })
})

describe('supportsDirectoryPicker / pickDirectory', () => {
  afterEach(() => {
    delete window.showDirectoryPicker
  })

  it('reports false when showDirectoryPicker does not exist on this browser', () => {
    expect(supportsDirectoryPicker()).toBe(false)
  })

  it('reports true when showDirectoryPicker exists', () => {
    window.showDirectoryPicker = () => Promise.resolve(fakeDirectoryHandle('x', []))
    expect(supportsDirectoryPicker()).toBe(true)
  })

  it('pickDirectory returns null (not a thrown error) when unsupported', async () => {
    expect(await pickDirectory()).toBeNull()
  })

  it('pickDirectory returns null when the user cancels (AbortError)', async () => {
    window.showDirectoryPicker = () =>
      Promise.reject(new DOMException('The user aborted a request.', 'AbortError'))
    expect(await pickDirectory()).toBeNull()
  })

  it('pickDirectory re-throws genuine errors rather than swallowing them', async () => {
    window.showDirectoryPicker = () => Promise.reject(new Error('disk on fire'))
    await expect(pickDirectory()).rejects.toThrow('disk on fire')
  })

  it('pickDirectory scans the picked folder on success', async () => {
    window.showDirectoryPicker = () =>
      Promise.resolve(fakeDirectoryHandle('Album', [['a.mp3', fakeFileHandle('a.mp3')]]))
    const result = await pickDirectory()
    expect(result).toEqual([{ file: expect.any(File), relativePath: 'Album/a.mp3' }])
  })
})
