/**
 * The pdf module's conversion core (issue #39): assembles JPG/PNG images into a PDF,
 * either one page per image (fits every other module's one-in/one-out shape) or every
 * selected image as pages of one combined document (the new many-in/one-out shape
 * ConverterEngine.combine() exists for - see platform/module.ts's header comment on
 * it for why this couldn't go through BatchScheduler instead).
 *
 * @cantoo/pdf-lib, not the original pdf-lib on npm: the original's last release was
 * 2021 with 317 open issues and no visible maintainer response pattern (checked via
 * the GitHub API's pushed_at, not just the README); @cantoo/pdf-lib is an
 * actively-maintained, API-compatible fork. embedJpg/embedPng are its only two
 * image-embed methods (confirmed by reading PDFDocument.d.ts) - no webp/avif source
 * until a canvas decode-and-reencode-to-PNG detour is built, so this only claims
 * jpg/png, matching platform/graph.ts's PDF_SOURCES.
 *
 * Each page is sized to its image's own pixel dimensions, one PDF point per pixel -
 * simplest possible choice, and the only one with no letterboxing/DPI decision to
 * make up.
 */
import { PDFDocument, type PDFImage } from '@cantoo/pdf-lib'
import type { ConvertProgress, ConvertResult } from '../../engine/convert'
import { ConversionError } from '../../engine/convert'

export interface PdfSettings {
  /** The only output format this module has. A real field rather than an
   *  ad-hoc key some other layer injects, matching every other module's shape -
   *  ModuleSettings' "Convert to" control still needs targetSettingKey to name a
   *  real field, even where there is only one choice. */
  format: 'pdf'
  /** True means every file in the batch becomes one page of one combined PDF,
   *  handled by ConverterEngine.combine() instead of convert(). Read by the shell
   *  (ConversionController), not by anything in this file - convert() and
   *  combineImagesToPdf() below don't need to know which mode chose to call them. */
  combine: boolean
}

type ImageFormat = 'jpg' | 'png'

/** Sniffs the actual bytes rather than trusting the Blob's `type` or the
 *  filename's extension - the same reasoning svg.ts's isSvg() sniff gives, and the
 *  only way to know which of pdf-lib's two embed methods a file actually needs. */
function detectImageFormat(bytes: Uint8Array): ImageFormat | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png'
  }
  return undefined
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  const format = detectImageFormat(bytes)
  if (format === undefined) {
    throw new ConversionError(
      'unreadable',
      'This file could not be read as a JPEG or PNG image.',
    )
  }
  try {
    return format === 'jpg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
  } catch (cause) {
    throw new ConversionError(
      'unreadable',
      'This image could not be read. It may be corrupted.',
      { cause },
    )
  }
}

function addImagePage(doc: PDFDocument, image: PDFImage) {
  const page = doc.addPage([image.width, image.height])
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
}

async function finalize(doc: PDFDocument, fileName: string): Promise<ConvertResult> {
  // .slice() for the same reason vorbis.ts's encoder output needs it: TypeScript's
  // DOM lib wants a plain ArrayBuffer-backed view for BlobPart, not the
  // SharedArrayBuffer-compatible type Uint8Array's generic default carries.
  const bytes = (await doc.save()).slice()
  return { blob: new Blob([bytes], { type: 'application/pdf' }), fileName }
}

/** One image, one page, one PDF - the shape every other module's ConverterEngine.
 *  convert() already has. */
export async function imageToPdf(
  file: Blob,
  baseName: string,
  options: {
    onProgress?: (progress: ConvertProgress) => void
    signal?: AbortSignal
  } = {},
): Promise<ConvertResult> {
  if (options.signal?.aborted) {
    throw new ConversionError('canceled', 'Conversion was canceled.')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const doc = await PDFDocument.create()
  const image = await embedImage(doc, bytes)
  addImagePage(doc, image)
  options.onProgress?.({ fraction: 1, processedSeconds: 0 })
  return finalize(doc, `${baseName}.pdf`)
}

/** Every file in the batch as pages of one combined PDF, in the order given -
 *  ConverterEngine.combine()'s implementation for this module. */
export async function combineImagesToPdf(
  files: readonly Blob[],
  baseNames: readonly string[],
  options: {
    onProgress?: (progress: ConvertProgress) => void
    signal?: AbortSignal
  } = {},
): Promise<ConvertResult> {
  if (options.signal?.aborted) {
    throw new ConversionError('canceled', 'Conversion was canceled.')
  }
  const doc = await PDFDocument.create()
  for (let i = 0; i < files.length; i++) {
    if (options.signal?.aborted) {
      throw new ConversionError('canceled', 'Conversion was canceled.')
    }
    const bytes = new Uint8Array(await files[i].arrayBuffer())
    const image = await embedImage(doc, bytes)
    addImagePage(doc, image)
    options.onProgress?.({ fraction: (i + 1) / files.length, processedSeconds: 0 })
  }
  // baseNames[0], not a fixed name: matches every other module's convention of
  // naming a batch's one output after the file that drove it, and gives repeat
  // combines of a different selection a different name instead of colliding.
  return finalize(doc, `${baseNames[0]}.pdf`)
}
