import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import { ConversionError } from '../../engine/convert'
import { combineImagesToPdf, imageToPdf } from './convert'

// Real, tiny images - generated once via `ffmpeg -f lavfi -i color=c=... -frames:v 1`,
// not hand-typed bytes, so @cantoo/pdf-lib is embedding a genuine JPEG/PNG the same
// way it would embed a real photo, not a byte pattern that merely looks like one.
const JPEG_4x4_RED =
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjExLjEwMAD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABMAAEBAAAAAAAAAAAAAAAAAAAABgEBAQAAAAAAAAAAAAAAAAAABgcQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAAEAAQDASIAAhEAAxEA/9oADAMBAAIRAxEAPwCLAE1/f//Z'
const JPEG_4x4_BLUE =
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjExLjEwMAD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABMAAEBAAAAAAAAAAAAAAAAAAAABwEBAQAAAAAAAAAAAAAAAAAABQcQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAAEAAQDASIAAhEAAxEA/9oADAMBAAIRAxEAPwCOAL+Kf//Z'
const PNG_3x5_BLUE =
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAAFCAIAAAAPE8H1AAAACXBIWXMAAAABAAAAAQBPJcTWAAAAFElEQVR4nGNkYPjPAAYsDDCAnwUAMMUBEeZzJhEAAAAASUVORK5CYII='

function bytesFromBase64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).slice()
}

function blob(base64: string, type: string): Blob {
  return new Blob([bytesFromBase64(base64)], { type })
}

const JPEG_RED = blob(JPEG_4x4_RED, 'image/jpeg')
const JPEG_BLUE = blob(JPEG_4x4_BLUE, 'image/jpeg')
const PNG_BLUE = blob(PNG_3x5_BLUE, 'image/png')

describe('imageToPdf', () => {
  it('produces a real one-page PDF sized to a JPEG source’s own pixel dimensions', async () => {
    const result = await imageToPdf(JPEG_RED, 'photo')
    expect(result.fileName).toBe('photo.pdf')
    expect(result.blob.type).toBe('application/pdf')

    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    const page = doc.getPage(0)
    expect(page.getWidth()).toBe(4)
    expect(page.getHeight()).toBe(4)
  })

  it('produces a real one-page PDF sized to a PNG source’s own pixel dimensions', async () => {
    const result = await imageToPdf(PNG_BLUE, 'scan')
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getPage(0).getWidth()).toBe(3)
    expect(doc.getPage(0).getHeight()).toBe(5)
  })

  it('rejects bytes that are neither a JPEG nor a PNG as unreadable, not a raw parser exception', async () => {
    const garbage = new Blob([new Uint8Array([1, 2, 3, 4])])
    await expect(imageToPdf(garbage, 'x')).rejects.toMatchObject({ reason: 'unreadable' })
  })

  it('rejects an already-aborted signal without doing any work', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      imageToPdf(JPEG_RED, 'photo', { signal: controller.signal }),
    ).rejects.toMatchObject({ reason: 'canceled' })
  })
})

describe('combineImagesToPdf', () => {
  it('combines several images into one PDF, as pages in the given order', async () => {
    const result = await combineImagesToPdf(
      [JPEG_RED, PNG_BLUE, JPEG_BLUE],
      ['first', 'second', 'third'],
    )
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(3)
    // Order proven by size, not just count: page 0 is the 4x4 JPEG, page 1 the
    // 3x5 PNG, page 2 the second 4x4 JPEG - a shuffled combine would still pass
    // a bare page-count check but fail this.
    expect([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()]).toEqual([4, 4])
    expect([doc.getPage(1).getWidth(), doc.getPage(1).getHeight()]).toEqual([3, 5])
    expect([doc.getPage(2).getWidth(), doc.getPage(2).getHeight()]).toEqual([4, 4])
  })

  it('names the output after the first file, not a fixed name', async () => {
    const result = await combineImagesToPdf(
      [JPEG_RED, PNG_BLUE],
      ['vacation-1', 'vacation-2'],
    )
    expect(result.fileName).toBe('vacation-1.pdf')
  })

  it('reports progress as a fraction of files embedded so far', async () => {
    const fractions: number[] = []
    await combineImagesToPdf([JPEG_RED, PNG_BLUE, JPEG_BLUE], ['a', 'b', 'c'], {
      onProgress: (p) => fractions.push(p.fraction),
    })
    expect(fractions).toEqual([1 / 3, 2 / 3, 1])
  })

  it('rejects one bad file in the batch as unreadable, without silently skipping it', async () => {
    const garbage = new Blob([new Uint8Array([1, 2, 3, 4])])
    await expect(
      combineImagesToPdf([JPEG_RED, garbage], ['good', 'bad']),
    ).rejects.toMatchObject({ reason: 'unreadable' })
  })

  it('rejects an already-aborted signal without embedding anything', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      combineImagesToPdf([JPEG_RED, PNG_BLUE], ['a', 'b'], { signal: controller.signal }),
    ).rejects.toMatchObject({ reason: 'canceled' })
  })

  it('checks the abort signal between files, not only at the start', async () => {
    const controller = new AbortController()
    let calls = 0
    await expect(
      combineImagesToPdf([JPEG_RED, PNG_BLUE, JPEG_BLUE], ['a', 'b', 'c'], {
        signal: controller.signal,
        onProgress: () => {
          calls += 1
          if (calls === 1) controller.abort()
        },
      }),
    ).rejects.toMatchObject({ reason: 'canceled' })
    // Aborted after the first file's progress callback, so at most the second
    // file's embed should have even started - proven by never reaching a third
    // progress call, since the abort check runs before each subsequent file.
    expect(calls).toBe(1)
  })
})

describe('ConversionError propagation', () => {
  it('imageToPdf never throws a bare parser exception - always a typed ConversionError', async () => {
    const garbage = new Blob([new Uint8Array(10)])
    const error = await imageToPdf(garbage, 'x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConversionError)
  })
})
