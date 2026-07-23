import { describe, expect, it } from 'vitest'
import { scanFileList, scanWebkitDirectoryFileList } from './scanFileList'

function fileListOf(files: File[]): FileList {
  return files as unknown as FileList
}

describe('scanFileList', () => {
  it('a loose file picker gives relativePath equal to the filename, no path info', () => {
    const files = [new File(['x'], 'a.mp3'), new File(['x'], 'b.mp3')]
    const result = scanFileList(fileListOf(files))
    expect(result).toEqual([
      { file: files[0], relativePath: 'a.mp3' },
      { file: files[1], relativePath: 'b.mp3' },
    ])
  })
})

describe('scanWebkitDirectoryFileList', () => {
  it("uses the browser's own webkitRelativePath directly, no manual path-building", () => {
    const file = new File(['x'], 'song.mp3')
    Object.defineProperty(file, 'webkitRelativePath', { value: 'Album/Disc1/song.mp3' })
    const result = scanWebkitDirectoryFileList(fileListOf([file]))
    expect(result).toEqual([{ file, relativePath: 'Album/Disc1/song.mp3' }])
  })

  it('falls back to the filename if webkitRelativePath is empty', () => {
    const file = new File(['x'], 'song.mp3')
    const result = scanWebkitDirectoryFileList(fileListOf([file]))
    expect(result[0].relativePath).toBe('song.mp3')
  })
})
