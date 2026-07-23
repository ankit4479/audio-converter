/**
 * Ported from Sources/AudioConverter/Models/AudioFile.swift's AudioFileTypes enum.
 * A filter to keep obvious non-audio files out of a drop, not a validator - a file
 * that fails to decode later is reported as a per-file failure (issue #11), not
 * rejected here.
 */
export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp3',
  'm4a',
  'aac',
  'flac',
  'wav',
  'aiff',
  'aif',
  'opus',
  'ogg',
  'oga',
  'wma',
  'wv',
  'ape',
  'caf',
  'alac',
])

export function isAudioFileName(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return false
  return AUDIO_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}
