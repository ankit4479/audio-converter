import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  canDecodeAudio,
  Conversion,
  FlacOutputFormat,
  Input,
  Mp3OutputFormat,
  Output,
  WavOutputFormat,
} from 'mediabunny'
import { describe, expect, it } from 'vitest'
import type { ConversionSettings } from './codec'
import { convertFile } from './convert'
import { ensureFlacEncoderRegistered } from './flac'
import { ensureMp3EncoderRegistered } from './mp3'

function makeWav(numSamples: number, sampleRate = 44100): Blob {
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
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
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

// Distinctive, arbitrary bytes standing in for cover art. Mediabunny carries embedded
// images as opaque byte blobs - it never decodes or re-encodes them - so this doesn't
// need to be a real, decodable JPEG to prove passthrough fidelity.
const FAKE_COVER_ART = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xff, 0xd9,
])

const TEST_TAGS = {
  title: 'Test Title',
  artist: 'Test Artist',
  album: 'Test Album',
  trackNumber: 3,
  date: new Date(2020, 0, 1),
  images: [{ data: FAKE_COVER_ART, mimeType: 'image/jpeg', kind: 'coverFront' as const }],
}

/**
 * Builds a tagged fixture in the given format via Mediabunny's own tag-writing,
 * rather than hand-rolling ID3/Vorbis-comment bytes. WAV needs no decode at all (raw
 * PCM), so it's the one format this can build and then feed back through convertFile
 * in plain vitest; MP3 and FLAC both need a real AudioDecoder to decode as a SOURCE
 * (confirmed: canDecodeAudio is false for both here, same jsdom/WebCodecs gap issue
 * #6 already hit for FLAC), so those two are only exercised live in a browser.
 */
async function makeTaggedFile(format: 'wav' | 'mp3' | 'flac'): Promise<Blob> {
  if (format === 'mp3') await ensureMp3EncoderRegistered()
  if (format === 'flac') await ensureFlacEncoderRegistered()

  const input = new Input({
    source: new BlobSource(makeWav(44100)),
    formats: ALL_FORMATS,
  })
  const target = new BufferTarget()
  const format_ =
    format === 'mp3'
      ? new Mp3OutputFormat()
      : format === 'flac'
        ? new FlacOutputFormat()
        : new WavOutputFormat({ metadataFormat: 'id3' })
  const output = new Output({ format: format_, target })
  const conversion = await Conversion.init({
    input,
    output,
    audio:
      format === 'mp3'
        ? { codec: 'mp3', bitrate: 192_000 }
        : format === 'flac'
          ? { codec: 'flac' }
          : { codec: 'pcm-s16' },
    tags: TEST_TAGS,
  })
  await conversion.execute()
  const mimeType = { mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav' }[format]
  return new Blob([target.buffer!], { type: mimeType })
}

const BASE_SETTINGS: ConversionSettings = {
  codec: 'flac',
  quality: 'best',
  compression: 'balanced',
  sampleRate: 'keepOriginal',
  keepMetadata: true,
}

async function expectTagsAndArt(blob: Blob): Promise<void> {
  const reread = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  const tags = await reread.getMetadataTags()

  expect(tags.title).toBe('Test Title')
  expect(tags.artist).toBe('Test Artist')
  expect(tags.album).toBe('Test Album')
  expect(tags.trackNumber).toBe(3)

  expect(tags.images).toBeDefined()
  expect(tags.images).toHaveLength(1)
  // Not re-encoded: the exact same bytes come back, not just "an image."
  expect(tags.images![0].data).toEqual(FAKE_COVER_ART)
  expect(tags.images![0].mimeType).toBe('image/jpeg')
}

const canDecodeMp3 = await canDecodeAudio('mp3')
const canDecodeFlacSource = await canDecodeAudio('flac')

describe('metadata passthrough (issue #8)', () => {
  it('with keepMetadata on, converting a tagged WAV to FLAC preserves tags and cover art unre-encoded', async () => {
    const tagged = await makeTaggedFile('wav')
    const result = await convertFile(tagged, 'x', {
      ...BASE_SETTINGS,
      keepMetadata: true,
    })
    await expectTagsAndArt(result.blob)
  })

  it.skipIf(!canDecodeMp3)(
    "converting a tagged MP3 to FLAC preserves tags and cover art (the issue's exact scenario)",
    async () => {
      const tagged = await makeTaggedFile('mp3')
      const result = await convertFile(tagged, 'x', {
        ...BASE_SETTINGS,
        keepMetadata: true,
      })
      await expectTagsAndArt(result.blob)
    },
  )

  it.skipIf(!canDecodeFlacSource)(
    'converting a tagged FLAC to another format also preserves tags and cover art',
    async () => {
      const tagged = await makeTaggedFile('flac')
      const result = await convertFile(tagged, 'x', {
        ...BASE_SETTINGS,
        codec: 'aac',
        keepMetadata: true,
      })
      await expectTagsAndArt(result.blob)
    },
  )

  it('with keepMetadata off, the output has no tags at all', async () => {
    const tagged = await makeTaggedFile('wav')
    const result = await convertFile(tagged, 'x', {
      ...BASE_SETTINGS,
      keepMetadata: false,
    })

    const reread = new Input({
      source: new BlobSource(result.blob),
      formats: ALL_FORMATS,
    })
    const tags = await reread.getMetadataTags()

    expect(tags.title).toBeUndefined()
    expect(tags.artist).toBeUndefined()
    expect(tags.album).toBeUndefined()
    expect(tags.images ?? []).toHaveLength(0)
  })

  it('a source with no tags or art converts without error, on or off', async () => {
    const plainWav = makeWav(4000)
    await expect(
      convertFile(plainWav, 'x', { ...BASE_SETTINGS, keepMetadata: true }),
    ).resolves.toBeDefined()
    await expect(
      convertFile(plainWav, 'x', { ...BASE_SETTINGS, keepMetadata: false }),
    ).resolves.toBeDefined()
  })

  it('WAV output also carries basic text tags when keepMetadata is on', async () => {
    const tagged = await makeTaggedFile('wav')
    const result = await convertFile(tagged, 'x', {
      ...BASE_SETTINGS,
      codec: 'wav',
      keepMetadata: true,
    })
    const reread = new Input({
      source: new BlobSource(result.blob),
      formats: ALL_FORMATS,
    })
    const tags = await reread.getMetadataTags()
    expect(tags.title).toBe('Test Title')
  })
})
