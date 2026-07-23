import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import { describe, expect, it, vi } from 'vitest'
import { CODEC_IDS, type ConversionSettings } from './codec'
import {
  ConversionError,
  convertFile,
  decodeConversionError,
  isEncodedConversionError,
} from './convert'

/**
 * A minimal valid 16-bit PCM WAV file: RIFF/WAVE/fmt /data chunks, no extra metadata.
 * Real end-to-end proof (not a mock) that convertFile actually decodes and re-encodes
 * PCM correctly. This works without a real browser because PCM read/write/resample in
 * Mediabunny doesn't touch WebCodecs (AudioEncoder/AudioDecoder) at all - only
 * compressed codecs need that, which is exactly why only WAV is wired up in this
 * issue (see formats.ts) and everything else is verified separately in a real browser.
 */
function makeWav(numSamples: number, sampleRate = 8000): Blob {
  const dataSize = numSamples * 2
  const buf = new Uint8Array(44 + dataSize)
  const view = new DataView(buf.buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, Math.round(Math.sin(i / 10) * 10000), true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

const BASE_SETTINGS: ConversionSettings = {
  codec: 'wav',
  quality: 'best',
  compression: 'balanced',
  sampleRate: 'keepOriginal',
  keepMetadata: true,
}

describe('convertFile - not-implemented codecs', () => {
  it.each(CODEC_IDS.filter((id) => id !== 'wav'))(
    'rejects %s with reason not-implemented, without touching the file at all',
    async (codec) => {
      // A garbage file that would fail as "unreadable" if convertFile got far enough
      // to actually open it - proving the not-implemented check happens first.
      const garbage = new Blob([new Uint8Array([1, 2, 3])])
      const error = await convertFile(garbage, 'x', { ...BASE_SETTINGS, codec }).catch(
        (e) => e,
      )
      expect(error).toBeInstanceOf(ConversionError)
      expect((error as ConversionError).reason).toBe('not-implemented')
    },
  )
})

describe('convertFile - error classification', () => {
  it('rejects unreadable garbage with reason unreadable', async () => {
    const garbage = new Blob([new Uint8Array(100).fill(0xff)])
    const error = await convertFile(garbage, 'x', BASE_SETTINGS).catch((e) => e)
    expect(error).toBeInstanceOf(ConversionError)
    expect((error as ConversionError).reason).toBe('unreadable')
  })

  it('rejects a readable file with no audio track with reason no-audio-track', async () => {
    const spy = vi.spyOn(Input.prototype, 'getPrimaryAudioTrack').mockResolvedValue(null)
    try {
      const error = await convertFile(makeWav(100), 'x', BASE_SETTINGS).catch((e) => e)
      expect(error).toBeInstanceOf(ConversionError)
      expect((error as ConversionError).reason).toBe('no-audio-track')
    } finally {
      spy.mockRestore()
    }
  })

  it('rejects immediately with reason canceled when the signal is already aborted', async () => {
    // Regression test: an AbortSignal that's already aborted never re-fires its
    // 'abort' event, so an addEventListener attached later (after the async Input/
    // Conversion.init setup) would silently miss it without an explicit .aborted
    // check at each await boundary. Caught by hand during this issue's review.
    const controller = new AbortController()
    controller.abort()
    const error = await convertFile(makeWav(4000), 'x', BASE_SETTINGS, {
      signal: controller.signal,
    }).catch((e) => e)
    expect(error).toBeInstanceOf(ConversionError)
    expect((error as ConversionError).reason).toBe('canceled')
  })
})

describe('surviving the Comlink worker boundary', () => {
  // Comlink's built-in thrown-error handling only copies `message`, `name`, and
  // `stack` when relaying a thrown error from a worker to the main thread - a custom
  // field like `reason` and the `instanceof ConversionError` check are both silently
  // lost. Verified for real with an actual Worker while building this (see
  // converter.ts's history): a ConversionError('no-audio-track', ...) thrown in the
  // worker arrived at the main thread as a plain Error with reason undefined. This
  // reconstructs the scenario without needing a real Worker: a plain Error with only
  // message/name/stack, exactly what deserialize() on the far side produces.
  function asComlinkWouldDeliverIt(error: ConversionError): Error {
    return Object.assign(new Error(error.message), {
      name: error.name,
      stack: error.stack,
    })
  }

  it('isEncodedConversionError recognizes a plain Error carrying an encoded reason', () => {
    const flattened = asComlinkWouldDeliverIt(
      new ConversionError('no-audio-track', 'No audio track found.'),
    )
    expect(flattened).not.toBeInstanceOf(ConversionError)
    expect(isEncodedConversionError(flattened)).toBe(true)
    expect(isEncodedConversionError(new Error('some other error'))).toBe(false)
  })

  it('decodeConversionError reconstructs the original reason and message', () => {
    const original = new ConversionError(
      'not-implemented',
      'No browser encoder is wired up yet for mp3.',
    )
    const flattened = asComlinkWouldDeliverIt(original)
    const decoded = decodeConversionError(flattened)
    expect(decoded).toBeInstanceOf(ConversionError)
    expect(decoded.reason).toBe('not-implemented')
    expect(decoded.message).toBe(original.message)
  })

  it('decodeConversionError is a no-op passthrough for an already-real ConversionError', () => {
    const original = new ConversionError('unreadable', 'File could not be read.')
    expect(decodeConversionError(original)).toBe(original)
  })
})

describe('convertFile - WAV end to end', () => {
  it('produces a valid, decodable WAV with matching duration, sample rate, and channels', async () => {
    const result = await convertFile(makeWav(4000, 8000), 'test', BASE_SETTINGS)

    expect(result.fileName).toBe('test.wav')
    expect(result.blob.type).toBe('audio/wav')

    const reread = new Input({
      source: new BlobSource(result.blob),
      formats: ALL_FORMATS,
    })
    expect(await reread.canRead()).toBe(true)
    const track = await reread.getPrimaryAudioTrack()
    expect(track).not.toBeNull()
    expect(await track!.getSampleRate()).toBe(8000)
    expect(await track!.getNumberOfChannels()).toBe(1)
    expect(await reread.computeDuration()).toBeCloseTo(0.5, 1)
  })

  it('resamples when a sample rate is requested', async () => {
    const result = await convertFile(makeWav(4000, 8000), 'test', {
      ...BASE_SETTINGS,
      sampleRate: 'hz44100',
    })
    const reread = new Input({
      source: new BlobSource(result.blob),
      formats: ALL_FORMATS,
    })
    const track = await reread.getPrimaryAudioTrack()
    expect(await track!.getSampleRate()).toBe(44100)
  })

  it('reports progress and reaches completion', async () => {
    const onProgress = vi.fn()
    await convertFile(makeWav(20000, 8000), 'test', BASE_SETTINGS, { onProgress })
    expect(onProgress).toHaveBeenCalled()
    const last = onProgress.mock.calls.at(-1)?.[0]
    expect(last.fraction).toBeGreaterThan(0)
  })
})
