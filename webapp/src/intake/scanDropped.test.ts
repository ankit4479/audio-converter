import { describe, expect, it } from 'vitest'
import { scanDroppedItems } from './scanDropped'

/** Minimal mocks matching the FileSystemEntry/FileSystemFileEntry/
 *  FileSystemDirectoryEntry/DataTransferItem interfaces this module actually calls,
 *  not full DOM implementations - jsdom doesn't implement the File and Directory
 *  Entries API at all, so these are hand-built. */
function fakeFileEntry(name: string, content = 'x'): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file(success: (file: File) => void) {
      success(new File([content], name))
    },
  } as unknown as FileSystemFileEntry
}

/** `batches` lets a test simulate readEntries()'s real behaviour: it can return
 *  results across multiple calls and must be called again until it yields empty. */
function fakeDirectoryEntry(
  name: string,
  batches: FileSystemEntry[][],
): FileSystemDirectoryEntry {
  let callIndex = 0
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader() {
      return {
        readEntries(success: (entries: FileSystemEntry[]) => void) {
          const batch = batches[callIndex] ?? []
          callIndex += 1
          success(batch)
        },
      } as unknown as FileSystemDirectoryReader
    },
  } as unknown as FileSystemDirectoryEntry
}

function fakeDataTransferItem(entry: FileSystemEntry | null): DataTransferItem {
  return {
    kind: 'file',
    webkitGetAsEntry: () => entry,
  } as unknown as DataTransferItem
}

function fakeItemList(items: DataTransferItem[]): DataTransferItemList {
  return items as unknown as DataTransferItemList
}

describe('scanDroppedItems', () => {
  it('a loose dropped file gets relativePath equal to just its own name', async () => {
    const items = fakeItemList([fakeDataTransferItem(fakeFileEntry('song.mp3'))])
    const result = await scanDroppedItems(items)
    expect(result).toEqual([{ file: expect.any(File), relativePath: 'song.mp3' }])
  })

  it('a dropped folder prefixes every file with the folder name, recursively', async () => {
    const nested = fakeDirectoryEntry('Nested', [[fakeFileEntry('deep.mp3')]])
    const folder = fakeDirectoryEntry('Album', [[fakeFileEntry('track1.mp3'), nested]])
    const items = fakeItemList([fakeDataTransferItem(folder)])

    const result = await scanDroppedItems(items)
    const paths = result.map((r) => r.relativePath).sort()
    expect(paths).toEqual(['Album/Nested/deep.mp3', 'Album/track1.mp3'])
  })

  it('calls readEntries repeatedly until it returns empty, not just once', async () => {
    // Simulates the real API returning entries across two batches before terminating.
    const folder = fakeDirectoryEntry('Album', [
      [fakeFileEntry('a.mp3')],
      [fakeFileEntry('b.mp3')],
      [],
    ])
    const items = fakeItemList([fakeDataTransferItem(folder)])
    const result = await scanDroppedItems(items)
    expect(result.map((r) => r.relativePath).sort()).toEqual([
      'Album/a.mp3',
      'Album/b.mp3',
    ])
  })

  it('ignores items that are not files (kind !== "file") and items with no entry', async () => {
    const items = fakeItemList([
      { kind: 'string', webkitGetAsEntry: () => null } as unknown as DataTransferItem,
      fakeDataTransferItem(null),
      fakeDataTransferItem(fakeFileEntry('real.mp3')),
    ])
    const result = await scanDroppedItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].relativePath).toBe('real.mp3')
  })

  it('mixes loose files and folders in a single drop, matching real usage', async () => {
    const folder = fakeDirectoryEntry('Album', [[fakeFileEntry('in-folder.mp3')]])
    const items = fakeItemList([
      fakeDataTransferItem(fakeFileEntry('loose.mp3')),
      fakeDataTransferItem(folder),
    ])
    const result = await scanDroppedItems(items)
    expect(result.map((r) => r.relativePath).sort()).toEqual([
      'Album/in-folder.mp3',
      'loose.mp3',
    ])
  })
})
