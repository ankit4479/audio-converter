/**
 * Shared helpers for the codecs that go through native WebCodecs with no bundled WASM
 * fallback (AAC, Opus) — runtime capability detection and bitrate-string parsing.
 * FLAC has its own module (flac.ts) since it needs the WASM-fallback path these two
 * don't have.
 */
import { canEncodeAudio } from 'mediabunny'
import { ConversionError } from './convert'

export type RuntimeAvailability = 'available' | 'unavailable'

export interface DetectionResult {
  aac: RuntimeAvailability
  opus: RuntimeAvailability
}

let detectionPromise: Promise<DetectionResult> | null = null

/**
 * Probes AAC and Opus encode support with the real `AudioEncoder.isConfigSupported()`
 * (via Mediabunny's canEncodeAudio, issue's own required approach) rather than user
 * agent sniffing. Runs once per page load and logs the result once, per the issue's
 * acceptance criterion; issue #13's UI reads this to decide what to show as available.
 */
export function detectAudioEncoders(): Promise<DetectionResult> {
  detectionPromise ??= (async () => {
    const [aac, opus] = await Promise.all([canEncodeAudio('aac'), canEncodeAudio('opus')])
    const result: DetectionResult = {
      aac: aac ? 'available' : 'unavailable',
      opus: opus ? 'available' : 'unavailable',
    }
    console.info('[audio-converter] audio encoder detection:', result)
    return result
  })()
  return detectionPromise
}

/** Turns codec.ts's "256k"/"192k" strings into bits per second for Mediabunny's
 *  numeric bitrate option. */
export function kbpsStringToBps(kbps: string): number {
  return Number.parseInt(kbps, 10) * 1000
}

/** Throws a typed, UI-distinguishable error if this browser can't encode `codec` -
 *  used as an EncodableFormat.ensureReady hook for codecs with no WASM fallback. */
export async function ensureWebCodecsSupport(
  codec: 'aac' | 'opus',
  label: string,
): Promise<void> {
  if (await canEncodeAudio(codec)) return
  throw new ConversionError(
    'unsupported-in-browser',
    `${label} encoding is not supported in this browser.`,
  )
}
