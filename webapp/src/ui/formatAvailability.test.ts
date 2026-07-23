import { describe, expect, it } from 'vitest'
import type { DetectionResult } from '../engine/webcodecs'
import { detectBrowserName, getCodecAvailabilityInfo } from './formatAvailability'

const BOTH_AVAILABLE: DetectionResult = { aac: 'available', opus: 'available' }
const BOTH_UNAVAILABLE: DetectionResult = { aac: 'unavailable', opus: 'unavailable' }

describe('detectBrowserName', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'Safari',
    ],
    [
      'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Chrome',
    ],
    [
      'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      'Edge',
    ],
    ['Mozilla/5.0 (Macintosh; rv:120.0) Gecko/20100101 Firefox/120.0', 'Firefox'],
    ['some unrecognizable string', 'this browser'],
  ])('identifies %s as %s', (ua, expected) => {
    expect(detectBrowserName(ua)).toBe(expected)
  })
})

describe('getCodecAvailabilityInfo', () => {
  it('supported codecs (mp3/flac/wav/aiff) are always enabled regardless of detection', () => {
    for (const id of ['mp3', 'flac', 'wav', 'aiff'] as const) {
      expect(getCodecAvailabilityInfo(id, BOTH_UNAVAILABLE)).toEqual({
        disabled: false,
        reason: null,
      })
    }
  })

  it('permanently unsupported codecs (alac/wavpack/wma/vorbis) are disabled with the "no encoder" wording, naming the format', () => {
    const alac = getCodecAvailabilityInfo('alac', BOTH_AVAILABLE)
    expect(alac.disabled).toBe(true)
    expect(alac.reason).toBe(
      'No browser encoder exists for Apple Lossless (ALAC). Use the Mac app for this format.',
    )

    const wavpack = getCodecAvailabilityInfo('wavpack', BOTH_AVAILABLE)
    expect(wavpack.reason).toContain('WavPack')

    const wma = getCodecAvailabilityInfo('wma', BOTH_AVAILABLE)
    expect(wma.reason).toContain('WMA')
  })

  it('runtimeDetected codecs (aac/opus) are enabled when the detection says available', () => {
    expect(getCodecAvailabilityInfo('aac', BOTH_AVAILABLE)).toEqual({
      disabled: false,
      reason: null,
    })
    expect(getCodecAvailabilityInfo('opus', BOTH_AVAILABLE)).toEqual({
      disabled: false,
      reason: null,
    })
  })

  it('runtimeDetected codecs are disabled with the browser-specific wording when unavailable here', () => {
    const info = getCodecAvailabilityInfo('aac', BOTH_UNAVAILABLE, 'Safari')
    expect(info.disabled).toBe(true)
    expect(info.reason).toBe('Not available in Safari. Works in Chrome.')
  })

  it('the never-supported and browser-specific wordings are textually distinct', () => {
    const neverSupported = getCodecAvailabilityInfo('alac', BOTH_UNAVAILABLE, 'Safari')
    const browserSpecific = getCodecAvailabilityInfo('aac', BOTH_UNAVAILABLE, 'Safari')
    expect(neverSupported.reason).not.toBe(browserSpecific.reason)
    expect(neverSupported.reason).toContain('Use the Mac app')
    expect(browserSpecific.reason).toContain('Works in Chrome')
  })
})
