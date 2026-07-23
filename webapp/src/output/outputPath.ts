/**
 * Ported from ConversionEngine.swift:179 (resolvedOutputURL) and :188 (deduplicated()).
 * Pure path arithmetic, no filesystem access, so the collision rule (issue #10's
 * "the way Finder does it") is fully testable without a real directory handle.
 */
import { CODECS, type CodecId } from '../engine/codec'

/**
 * Splits a relative path's last component into a base and extension, matching
 * Foundation's NSString.deletingPathExtension/pathExtension (what resolvedOutputURL
 * and deduplicated() actually call) rather than a naive "text after the last dot":
 * a dotfile like ".hidden" has no extension at all - the leading dot is part of the
 * name, not a separator - while ".hidden.wav" does (extension "wav").
 */
function splitExtension(relativePath: string): { base: string; extension: string } {
  const lastSlash = relativePath.lastIndexOf('/')
  const dirPrefix = relativePath.slice(0, lastSlash + 1)
  const fileName = relativePath.slice(lastSlash + 1)

  const lastDot = fileName.lastIndexOf('.')
  // lastDot <= 0 covers both "no dot at all" and "the only dot is the leading
  // character" (a dotfile with nothing after it counts as a separator) - in both
  // cases there's no real extension to split off.
  if (lastDot <= 0) return { base: dirPrefix + fileName, extension: '' }
  return {
    base: dirPrefix + fileName.slice(0, lastDot),
    extension: fileName.slice(lastDot),
  }
}

/** Swaps the extension for the target codec's, same as resolvedOutputURL. */
export function resolvedOutputPath(relativePath: string, codec: CodecId): string {
  const { base } = splitExtension(relativePath)
  return `${base}.${CODECS[codec].fileExtension}`
}

/**
 * Renames the 2nd, 3rd... colliding path onto " (2)", " (3)", the way Finder would -
 * flattened or overlapping folder structures can otherwise map two different source
 * files onto the same output path. Order-preserving: the first file to claim a path
 * keeps it unchanged, matching deduplicated()'s array-order semantics.
 */
export function deduplicatePaths(paths: readonly string[]): string[] {
  const seenCounts = new Map<string, number>()
  return paths.map((path) => {
    const count = (seenCounts.get(path) ?? 0) + 1
    seenCounts.set(path, count)
    if (count === 1) return path

    const { base, extension } = splitExtension(path)
    return `${base} (${count})${extension}`
  })
}

/** Resolves and deduplicates output paths for a whole batch in one call, mirroring
 *  how ConversionEngine.start() computes every job's outputURL before any file is
 *  written - the collision rule needs the full batch, not just one file at a time. */
export function resolveOutputPaths(
  relativePaths: readonly string[],
  codec: CodecId,
): string[] {
  return deduplicatePaths(relativePaths.map((path) => resolvedOutputPath(path, codec)))
}
