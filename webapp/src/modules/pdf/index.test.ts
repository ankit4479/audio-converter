import { describe, expect, it } from 'vitest'
import { pdfModule } from './index'

describe('pdfModule.accepts', () => {
  it('accepts jpg/jpeg/png, case-insensitively', () => {
    expect(pdfModule.accepts({ name: 'photo.jpg', type: 'image/jpeg', size: 10 })).toBe(
      true,
    )
    expect(pdfModule.accepts({ name: 'PHOTO.JPEG', type: '', size: 10 })).toBe(true)
    expect(pdfModule.accepts({ name: 'scan.png', type: 'image/png', size: 10 })).toBe(
      true,
    )
  })

  it('rejects formats it cannot embed - webp, avif, heic - not silently promised', () => {
    expect(pdfModule.accepts({ name: 'photo.webp', type: 'image/webp', size: 10 })).toBe(
      false,
    )
    expect(pdfModule.accepts({ name: 'photo.avif', type: '', size: 10 })).toBe(false)
    expect(pdfModule.accepts({ name: 'photo.heic', type: '', size: 10 })).toBe(false)
  })

  it('rejects non-image files', () => {
    expect(pdfModule.accepts({ name: 'song.mp3', type: 'audio/mpeg', size: 10 })).toBe(
      false,
    )
  })
})

describe('pdfModule format lists', () => {
  it('accepts exactly jpg and png as input, matching platform/graph.ts PDF_SOURCES', () => {
    expect([...pdfModule.inputFormats].sort()).toEqual(['jpg', 'png'])
  })

  it('has exactly one output format: pdf', () => {
    expect(pdfModule.outputFormats).toEqual(['pdf'])
  })
})

describe('pdfModule settings', () => {
  it('defaults to combine off, matching every other module’s one-in/one-out expectation', () => {
    expect(pdfModule.defaultSettings).toEqual({ format: 'pdf', combine: false })
  })

  it('names combine as the module’s combineSettingKey', () => {
    expect(pdfModule.combineSettingKey).toBe('combine')
  })

  it('hides the combine toggle for one file, shows it for 2+, hides it when file count is unknown', () => {
    const combine = pdfModule.settingsSchema.find((field) => field.key === 'combine')
    expect(combine).toBeDefined()
    expect(combine!.visibleIf?.({ values: {}, fileCount: 1 })).toBe(false)
    expect(combine!.visibleIf?.({ values: {}, fileCount: 2 })).toBe(true)
    expect(combine!.visibleIf?.({ values: {}, fileCount: 5 })).toBe(true)
    expect(combine!.visibleIf?.({ values: {} })).toBe(false)
  })
})

describe('pdfModule.probe', () => {
  it('reports supported - @cantoo/pdf-lib is pure JS with no WASM/canvas requirement', async () => {
    await expect(pdfModule.probe()).resolves.toEqual({ supported: true })
  })
})
