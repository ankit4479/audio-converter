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

/**
 * Video containers accepted so their audio track can be extracted (issue #38) - kept
 * separate from AUDIO_EXTENSIONS since these are containers being mined for audio,
 * not audio codecs, even though isAudioFileName accepts both. Limited to exactly what
 * Mediabunny demuxes (platform/graph.ts's AUDIO_VIDEO_SOURCE_IDS is the source of
 * truth for the format-id side of this same list) - AVI is deliberately excluded, no
 * viable browser-side demuxer exists for it.
 */
export const VIDEO_CONTAINER_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp4',
  'm4v',
  'mov',
  'mkv',
  'webm',
])

export function isAudioFileName(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return false
  const extension = name.slice(dot + 1).toLowerCase()
  return AUDIO_EXTENSIONS.has(extension) || VIDEO_CONTAINER_EXTENSIONS.has(extension)
}
