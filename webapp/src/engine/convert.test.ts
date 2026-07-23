import {
  ALL_FORMATS,
  BlobSource,
  canDecodeAudio,
  canEncodeAudio,
  Input,
} from 'mediabunny'
import { describe, expect, it, vi } from 'vitest'
import { CODEC_IDS, type ConversionSettings } from './codec'
import {
  ConversionError,
  convertFile,
  decodeConversionError,
  isEncodedConversionError,
} from './convert'

// AAC/Opus have no WASM fallback (formats.ts) - encoding them for real requires an
// actual browser's WebCodecs AudioEncoder, which this test environment (vitest/jsdom)
// doesn't implement. FLAC's *encoder* is a WASM fallback and works here, but its
// *decoder* isn't (no @mediabunny/flac-decoder package exists), so the round-trip
// test needs real decode support too. Gated on the real capability check rather than
// skipped unconditionally, so these tests run for real wherever that capability
// exists (a real browser), and skip visibly (not silently) elsewhere.
const canEncodeAac = await canEncodeAudio('aac')
const canEncodeOpus = await canEncodeAudio('opus')
const canDecodeFlac = await canDecodeAudio('flac')

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
  const IMPLEMENTED_CODECS = new Set(['wav', 'mp3', 'aac', 'opus', 'flac', 'aiff'])
  it.each(CODEC_IDS.filter((id) => !IMPLEMENTED_CODECS.has(id)))(
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

describe('convertFile - MP3 end to end', () => {
  // 2 seconds at 44.1kHz mono, long enough for the CBR bitrate to stabilize past LAME's
  // initial buffering and for getAverageBitrate() to reflect the real encoded rate.
  const twoSecondsOfAudio = () => makeWav(44100 * 2, 44100)

  it.each([
    ['best', 245_000],
    ['good', 190_000],
    ['small', 130_000],
  ] as const)(
    'encodes %s quality at the expected LAME V0/V2/V5 average bitrate (%dbps)',
    async (quality, expectedBitrate) => {
      const result = await convertFile(twoSecondsOfAudio(), 'test', {
        ...BASE_SETTINGS,
        codec: 'mp3',
        quality,
      })

      expect(result.fileName).toBe('test.mp3')
      expect(result.blob.type).toBe('audio/mpeg')

      const reread = new Input({
        source: new BlobSource(result.blob),
        formats: ALL_FORMATS,
      })
      expect(await reread.canRead()).toBe(true)
      const track = await reread.getPrimaryAudioTrack()
      expect(track).not.toBeNull()
      expect(track!.codec).toBe('mp3')
      expect(await reread.computeDuration()).toBeCloseTo(2, 0)

      // CBR, so the actual encoded bitrate should land almost exactly on the target -
      // this is the acceptance criterion ("bitrates land in the expected V0/V2/V5
      // ranges"), computed from the real encoded packets, not just the request.
      // (getAverageBitrate() reads stream metadata rather than computing from packets,
      // and returned null here - Mp3OutputFormat apparently doesn't write a bitrate
      // metadata field the demuxer reads back out.)
      const { averageBitrate } = await track!.computePacketStats()
      expect(averageBitrate).toBeGreaterThan(expectedBitrate * 0.9)
      expect(averageBitrate).toBeLessThan(expectedBitrate * 1.1)
    },
  )

  it('produces meaningfully different file sizes across the three tiers', async () => {
    const sizes: Record<string, number> = {}
    for (const quality of ['best', 'good', 'small'] as const) {
      const result = await convertFile(twoSecondsOfAudio(), 'test', {
        ...BASE_SETTINGS,
        codec: 'mp3',
        quality,
      })
      sizes[quality] = result.blob.size
    }
    expect(sizes.best).toBeGreaterThan(sizes.good)
    expect(sizes.good).toBeGreaterThan(sizes.small)
  })
})

describe('convertFile - AAC end to end', () => {
  it.skipIf(!canEncodeAac)('produces a valid, playable AAC (m4a) file', async () => {
    const result = await convertFile(makeWav(44100 * 2, 44100), 'test', {
      ...BASE_SETTINGS,
      codec: 'aac',
    })
    expect(result.fileName).toBe('test.m4a')
    expect(result.blob.type).toBe('audio/mp4')

    const reread = new Input({
      source: new BlobSource(result.blob),
      formats: ALL_FORMATS,
    })
    expect(await reread.canRead()).toBe(true)
    const track = await reread.getPrimaryAudioTrack()
    expect(track!.codec).toBe('aac')
    expect(await reread.computeDuration()).toBeCloseTo(2, 0)
  })

  it.skipIf(!canEncodeAac)('honours the 256k/192k/128k bitrate tiers', async () => {
    const { averageBitrate } = await (async () => {
      const result = await convertFile(makeWav(44100 * 2, 44100), 'test', {
        ...BASE_SETTINGS,
        codec: 'aac',
        quality: 'good',
      })
      const reread = new Input({
        source: new BlobSource(result.blob),
        formats: ALL_FORMATS,
      })
      const track = await reread.getPrimaryAudioTrack()
      return track!.computePacketStats()
    })()
    expect(averageBitrate).toBeGreaterThan(192_000 * 0.8)
    expect(averageBitrate).toBeLessThan(192_000 * 1.2)
  })

  it('reports unsupported-in-browser instead of an opaque failure when AAC is unavailable', async () => {
    if (canEncodeAac) return // nothing to assert - this browser genuinely supports it
    const error = await convertFile(makeWav(4000), 'x', {
      ...BASE_SETTINGS,
      codec: 'aac',
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConversionError)
    expect((error as ConversionError).reason).toBe('unsupported-in-browser')
  })
})

describe('convertFile - Opus end to end', () => {
  it.skipIf(!canEncodeOpus)(
    'produces a valid, playable Opus file in an Ogg container',
    async () => {
      const result = await convertFile(makeWav(44100 * 2, 44100), 'test', {
        ...BASE_SETTINGS,
        codec: 'opus',
      })
      expect(result.fileName).toBe('test.opus')
      expect(result.blob.type).toBe('audio/opus')

      const reread = new Input({
        source: new BlobSource(result.blob),
        formats: ALL_FORMATS,
      })
      expect(await reread.canRead()).toBe(true)
      const track = await reread.getPrimaryAudioTrack()
      expect(track!.codec).toBe('opus')
      expect(await reread.computeDuration()).toBeCloseTo(2, 0)
    },
  )

  it('reports unsupported-in-browser instead of an opaque failure when Opus is unavailable', async () => {
    if (canEncodeOpus) return
    const error = await convertFile(makeWav(4000), 'x', {
      ...BASE_SETTINGS,
      codec: 'opus',
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConversionError)
    expect((error as ConversionError).reason).toBe('unsupported-in-browser')
  })
})

describe('convertFile - FLAC end to end', () => {
  it('produces a valid FLAC file with matching duration, sample rate, and channels', async () => {
    const result = await convertFile(makeWav(44100 * 2, 44100), 'test', {
      ...BASE_SETTINGS,
      codec: 'flac',
    })
    expect(result.fileName).toBe('test.flac')
    expect(result.blob.type).toBe('audio/flac')

    const reread = new Input({
      source: new BlobSource(result.blob),
      formats: ALL_FORMATS,
    })
    expect(await reread.canRead()).toBe(true)
    const track = await reread.getPrimaryAudioTrack()
    expect(track!.codec).toBe('flac')
    expect(await reread.computeDuration()).toBeCloseTo(2, 0)
  })

  it.skipIf(!canDecodeFlac)(
    'decodes back to PCM identical to the source (lossless round trip)',
    async () => {
      const sourceWav = makeWav(44100, 44100)
      const sourcePcm = new Uint8Array(await sourceWav.arrayBuffer()).slice(44)

      const flacResult = await convertFile(sourceWav, 'x', {
        ...BASE_SETTINGS,
        codec: 'flac',
      })
      const wavBack = await convertFile(flacResult.blob, 'y', {
        ...BASE_SETTINGS,
        codec: 'wav',
      })
      const roundTrippedPcm = new Uint8Array(await wavBack.blob.arrayBuffer()).slice(44)

      expect(roundTrippedPcm).toEqual(sourcePcm)
    },
  )

  it(
    'documents a real, confirmed gap: the three compression tiers currently produce ' +
      "IDENTICAL output, since neither Mediabunny's ConversionAudioOptions nor " +
      "@mediabunny/flac-encoder's worker protocol expose any compression-level knob " +
      '(see flac.ts). This is not the acceptance criterion the issue asked for - it is ' +
      'a regression marker: if this ever starts failing, a knob has become available ' +
      'and issue #6 should be revisited to actually use it.',
    async () => {
      const sizes: number[] = []
      for (const compression of ['balanced', 'fast', 'smallest'] as const) {
        const result = await convertFile(makeWav(44100 * 2, 44100), 'test', {
          ...BASE_SETTINGS,
          codec: 'flac',
          compression,
        })
        sizes.push(result.blob.size)
      }
      expect(sizes[0]).toBe(sizes[1])
      expect(sizes[1]).toBe(sizes[2])
    },
  )
})

describe('convertFile - AIFF end to end', () => {
  it('produces a valid big-endian AIFF file with matching channel count, sample rate, and duration', async () => {
    const result = await convertFile(makeWav(44100 * 2, 44100), 'test', {
      ...BASE_SETTINGS,
      codec: 'aiff',
    })
    expect(result.fileName).toBe('test.aiff')
    expect(result.blob.type).toBe('audio/aiff')

    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    const view = new DataView(bytes.buffer)
    const ascii = (offset: number, len: number) =>
      String.fromCharCode(...bytes.subarray(offset, offset + len))

    expect(ascii(0, 4)).toBe('FORM')
    expect(ascii(8, 4)).toBe('AIFF')
    expect(view.getUint16(20, false)).toBe(1) // mono, matches the source
    expect(view.getUint32(22, false)).toBe(88200) // 2 seconds at 44100Hz
    expect(view.getUint16(28, false)).toBe(0x400e) // 44100Hz as an 80-bit float
  })

  it('round trips to PCM identical to the source, confirmed big-endian by inspecting the bytes', async () => {
    const sourceWav = makeWav(4000, 8000)
    const sourcePcm = new Uint8Array(await sourceWav.arrayBuffer()).slice(44)

    const result = await convertFile(sourceWav, 'test', {
      ...BASE_SETTINGS,
      codec: 'aiff',
    })
    const aiffBytes = new Uint8Array(await result.blob.arrayBuffer())

    // SSND data starts at 38 (FORM+AIFF+COMM) + 16 (SSND id/size/offset/blockSize).
    const ssndDataStart = 38 + 16
    const ssndData = aiffBytes.slice(ssndDataStart)
    expect(ssndData.length).toBe(sourcePcm.length)

    // Byte-swap AIFF's big-endian samples back to little-endian and compare directly
    // against the source - this is both the round-trip and the big-endian check the
    // issue asks for, verified from the actual bytes rather than "by ear".
    const swappedBack = new Uint8Array(ssndData.length)
    for (let i = 0; i < ssndData.length; i += 2) {
      swappedBack[i] = ssndData[i + 1]
      swappedBack[i + 1] = ssndData[i]
    }
    expect(swappedBack).toEqual(sourcePcm)
  })

  it('resamples when a sample rate is requested, same as the WAV path it reuses', async () => {
    const result = await convertFile(makeWav(4000, 8000), 'test', {
      ...BASE_SETTINGS,
      codec: 'aiff',
      sampleRate: 'hz44100',
    })
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    const view = new DataView(bytes.buffer)
    expect(view.getUint16(28, false)).toBe(0x400e) // 44100's biased exponent
    expect(view.getUint32(30, false)).toBe(0xac440000)
  })
})
