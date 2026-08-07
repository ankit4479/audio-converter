import { describe, expect, it } from 'vitest'
import { isHeifContainer } from './heic'

/**
 * Builds the front of an ISO-BMFF file: a 4-byte big-endian box size, the box type,
 * then the major brand. Real bytes rather than a mock, because what is under test is
 * the byte-level sniff itself.
 */
function ftyp(type: string, brand: string, extra = 32): Blob {
  const header = new Uint8Array(16 + extra)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) header[offset + i] = text.charCodeAt(i)
  }
  header[0] = 0
  header[1] = 0
  header[2] = 0
  header[3] = 16 + extra
  ascii(4, type)
  ascii(8, brand)
  return new Blob([header])
}

describe('isHeifContainer', () => {
  it('recognises the brands Apple writes for iPhone photos', async () => {
    for (const brand of ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs']) {
      expect(await isHeifContainer(ftyp('ftyp', brand))).toBe(true)
    }
  })

  it('recognises the generic HEIF brands other cameras and Android write', async () => {
    for (const brand of ['mif1', 'msf1', 'heif']) {
      expect(await isHeifContainer(ftyp('ftyp', brand))).toBe(true)
    }
  })

  it('rejects other ISO-BMFF containers that share the ftyp box', async () => {
    // An MP4 or a JPEG-2000 file is ISO-BMFF too; only the brand distinguishes them,
    // which is why the check is on the brand and not merely on 'ftyp' being present.
    for (const brand of ['mp42', 'isom', 'qt  ', 'avif']) {
      expect(await isHeifContainer(ftyp('ftyp', brand))).toBe(false)
    }
  })

  it('rejects a file with no ftyp box at all, such as a real JPEG', async () => {
    const jpegStart = new Blob([
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ])
    expect(await isHeifContainer(jpegStart)).toBe(false)
  })

  it('rejects a JPEG that was merely renamed .heic, so no WASM is downloaded for it', async () => {
    // The point of sniffing rather than trusting the extension: this file would
    // otherwise trigger a ~1.4MB decoder download before failing anyway.
    const renamed = new Blob([new Uint8Array(64)], { type: 'image/heic' })
    expect(await isHeifContainer(renamed)).toBe(false)
  })

  it('rejects a file too short to hold a brand without reading past its end', async () => {
    expect(await isHeifContainer(new Blob([new Uint8Array(8)]))).toBe(false)
    expect(await isHeifContainer(new Blob([]))).toBe(false)
  })

  it('reads only the first 16 bytes, so the check costs nothing next to a decode', async () => {
    let requestedEnd = -1
    const huge = ftyp('ftyp', 'heic', 1024)
    const spy = new Proxy(huge, {
      get(target, key) {
        if (key === 'slice') {
          return (start: number, end: number) => {
            requestedEnd = end
            return target.slice(start, end)
          }
        }
        return Reflect.get(target, key, target)
      },
    })
    expect(await isHeifContainer(spy as Blob)).toBe(true)
    expect(requestedEnd).toBe(16)
  })
})
