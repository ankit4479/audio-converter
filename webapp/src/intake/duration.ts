import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import type { AudioFile } from './audioFile'

// Matches FileIntake.totalDuration's bounded concurrency (Swift: 8), so a batch of
// hundreds of songs doesn't open hundreds of decoders/parsers at once.
const CONCURRENCY = 8

async function durationOf(file: AudioFile): Promise<number> {
  try {
    // computeDuration() reads container-level structure (frame counts, header
    // fields) rather than fully decoding, confirmed empirically: it works for MP3
    // without a real AudioDecoder, the same way canRead()/getPrimaryAudioTrack() do.
    const input = new Input({ source: new BlobSource(file.file), formats: ALL_FORMATS })
    const duration = await input.computeDuration()
    return duration && Number.isFinite(duration) && duration > 0 ? duration : 0
  } catch {
    // A file that fails to parse is a per-file failure (issue #11's job to surface),
    // not a reason to break the duration sum - matches totalDuration's `try?`.
    return 0
  }
}

/** Sums duration across `files` with bounded concurrency. `signal` lets a caller
 *  abandon a stale scan early (FileIntakeStore's generation guard already ignores a
 *  stale result when it resolves, but stopping early saves wasted work too). */
export async function totalDuration(
  files: readonly AudioFile[],
  signal?: AbortSignal,
): Promise<number> {
  let total = 0
  let index = 0

  async function worker(): Promise<void> {
    while (index < files.length) {
      if (signal?.aborted) return
      const file = files[index]
      index += 1
      // Deliberately not `total += await durationOf(file)`: that reads `total`'s
      // value *before* awaiting, so a concurrent worker's own update made during
      // this await gets silently overwritten once this one resumes and writes back
      // its stale snapshot plus its own result - a classic lost-update race across
      // an await boundary. Splitting the await from the accumulation removes the gap.
      const duration = await durationOf(file)
      total += duration
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker))
  return total
}
