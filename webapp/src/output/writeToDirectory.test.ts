import { describe, expect, it } from 'vitest'
import { OutputPermissionDeniedError, writeToDirectory } from './writeToDirectory'

/** Minimal in-memory stand-in for FileSystemDirectoryHandle/FileSystemFileHandle,
 *  just enough surface for writeToDirectory to exercise real nested-directory and
 *  write behavior without a browser. */
class FakeFileHandle {
  written: Blob | null = null
  async createWritable() {
    return {
      write: async (data: Blob) => {
        this.written = data
      },
      close: async () => {},
    }
  }
}

class FakeDirectoryHandle {
  dirs = new Map<string, FakeDirectoryHandle>()
  files = new Map<string, FakeFileHandle>()
  denyWrites = false

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    let dir = this.dirs.get(name)
    if (!dir) {
      if (!options?.create) throw new DOMException('Not found', 'NotFoundError')
      dir = new FakeDirectoryHandle()
      this.dirs.set(name, dir)
    }
    return dir
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (this.denyWrites) {
      throw new DOMException('Permission denied', 'NotAllowedError')
    }
    let file = this.files.get(name)
    if (!file) {
      if (!options?.create) throw new DOMException('Not found', 'NotFoundError')
      file = new FakeFileHandle()
      this.files.set(name, file)
    }
    return file
  }
}

function fakeRoot() {
  return new FakeDirectoryHandle() as unknown as FileSystemDirectoryHandle
}

describe('writeToDirectory', () => {
  it('writes a flat file directly under the root', async () => {
    const root = fakeRoot() as unknown as FakeDirectoryHandle
    const blob = new Blob(['hello'])
    await writeToDirectory(
      root as unknown as FileSystemDirectoryHandle,
      'song.flac',
      blob,
    )
    expect(root.files.get('song.flac')?.written).toBe(blob)
  })

  it('creates nested subdirectories to mirror a relative path', async () => {
    const root = fakeRoot() as unknown as FakeDirectoryHandle
    const blob = new Blob(['data'])
    await writeToDirectory(
      root as unknown as FileSystemDirectoryHandle,
      'Album/Disc 1/track.flac',
      blob,
    )
    const album = root.dirs.get('Album')
    const disc = album?.dirs.get('Disc 1')
    expect(disc?.files.get('track.flac')?.written).toBe(blob)
  })

  it('reuses an existing subdirectory rather than failing on the second file', async () => {
    const root = fakeRoot() as unknown as FakeDirectoryHandle
    await writeToDirectory(
      root as unknown as FileSystemDirectoryHandle,
      'Album/a.flac',
      new Blob(['a']),
    )
    await writeToDirectory(
      root as unknown as FileSystemDirectoryHandle,
      'Album/b.flac',
      new Blob(['b']),
    )
    expect(root.dirs.size).toBe(1)
    expect(root.dirs.get('Album')?.files.size).toBe(2)
  })

  it('wraps a NotAllowedError as OutputPermissionDeniedError, not a raw DOMException', async () => {
    const root = fakeRoot() as unknown as FakeDirectoryHandle
    root.denyWrites = true
    await expect(
      writeToDirectory(
        root as unknown as FileSystemDirectoryHandle,
        'song.flac',
        new Blob(),
      ),
    ).rejects.toThrow(OutputPermissionDeniedError)
  })
})
