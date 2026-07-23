import type { AudioFile } from './audioFile'

/**
 * Approximates macOS's ByteCountFormatter(.file) style: base-1000 (decimal) units
 * matching Finder's own display convention, not base-1024. Apple's exact rounding
 * and precision rules per magnitude are a private implementation detail with no
 * public spec, so this is a documented approximation (same category as issue #5's
 * MP3 bitrate approximation) rather than a byte-for-byte port - not independently
 * verifiable without a real Mac to compare against.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} byte${bytes === 1 ? '' : 's'}`
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes / 1000
  let unitIndex = 0
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000
    unitIndex += 1
  }
  const precision = unitIndex === 0 ? 0 : 1
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}

/** Ported from AppState.totalSizeLabel (AppState.swift:38-41). */
export function totalSizeLabel(files: readonly AudioFile[]): string {
  const bytes = files.reduce((sum, f) => sum + f.fileSize, 0)
  return formatFileSize(bytes)
}

/** Ported from AppState.durationLabel (AppState.swift:43-50), wording included. */
export function durationLabel(
  totalDurationSeconds: number,
  isCalculatingDuration: boolean,
): string {
  if (totalDurationSeconds > 0) {
    const hours = Math.floor(totalDurationSeconds / 3600)
    const minutes = Math.floor((totalDurationSeconds % 3600) / 60)
    return hours > 0
      ? `about ${hours}h ${minutes}m of music`
      : `about ${minutes}m of music`
  }
  return isCalculatingDuration ? 'Calculating duration…' : ''
}
