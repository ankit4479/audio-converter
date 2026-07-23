/**
 * Turns codec.ts's static availability field plus issue #6's runtime detection into
 * the exact disabled-state and reason text the Setup screen's format picker (#14)
 * renders. Kept separate from the picker component itself so the message logic is
 * unit-testable without React or DOM rendering involved.
 */
import { CODECS, type CodecId } from '../engine/codec'
import type { DetectionResult } from '../engine/webcodecs'

export interface CodecAvailabilityInfo {
  readonly disabled: boolean
  /** null when not disabled. */
  readonly reason: string | null
}

/**
 * Identifies the current browser by name for display copy only ("Not available in
 * Safari"). Distinct from issue #6's canEncodeAudio()-based capability detection,
 * which is what actually gates whether a format can be used - this never drives a
 * disabled/enabled decision, only which browser name appears in the message once a
 * capability check has already said "unavailable".
 */
export function detectBrowserName(userAgent: string = navigator.userAgent): string {
  if (/Edg\//.test(userAgent)) return 'Edge'
  if (/Firefox\//.test(userAgent)) return 'Firefox'
  if (/Chrome\//.test(userAgent) || /Chromium\//.test(userAgent)) return 'Chrome'
  if (/Safari\//.test(userAgent)) return 'Safari'
  return 'this browser'
}

/** Where the Setup screen's disabled-format link points, matching the root
 *  README's own Install section. */
export const MACOS_DOWNLOAD_URL = 'https://github.com/ankit4479/audio-converter/releases'

/**
 * The two distinct wordings the issue asks for:
 *  - unsupportedInBrowser (ALAC/WavPack/WMA, permanently, no runtime check needed):
 *    "No browser encoder exists for X. Use the Mac app for this format."
 *  - runtimeDetected but currently unavailable (AAC/Opus on a browser lacking it):
 *    "Not available in <browser>. Works in Chrome."
 */
export function getCodecAvailabilityInfo(
  codecId: CodecId,
  runtimeDetection: DetectionResult,
  browserName: string = detectBrowserName(),
): CodecAvailabilityInfo {
  const codec = CODECS[codecId]

  if (codec.availability === 'supported') {
    return { disabled: false, reason: null }
  }

  if (codec.availability === 'unsupportedInBrowser') {
    return {
      disabled: true,
      reason: `No browser encoder exists for ${codec.label}. Use the Mac app for this format.`,
    }
  }

  // 'runtimeDetected' - only aac and opus currently have this classification
  // (codec.ts), each with a matching key in DetectionResult.
  const runtimeKey = codecId === 'aac' || codecId === 'opus' ? codecId : null
  const isAvailable = runtimeKey !== null && runtimeDetection[runtimeKey] === 'available'

  if (isAvailable) {
    return { disabled: false, reason: null }
  }
  return {
    disabled: true,
    reason: `Not available in ${browserName}. Works in Chrome.`,
  }
}
