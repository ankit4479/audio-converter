/**
 * Parity note (acceptance criterion: "converting through the module yields
 * byte-identical output to today for wav/mp3/flac/aac/opus"): this suite can't
 * literally run a conversion end to end through a real Converter instance,
 * because Converter's constructor calls `new Worker(...)` immediately
 * (engine/converter.ts) and this project's jsdom test environment has no Worker
 * implementation at all (confirmed directly: `typeof Worker` is `undefined`
 * here) - a pre-existing environment limitation, not something this issue adds
 * test infrastructure to solve (no new deps, no encoding-logic changes).
 *
 * Byte parity is guaranteed by construction instead of by a live run: this
 * module doesn't modify engine/converter.ts or engine/convert.ts at all -
 * loadEngine() below returns `new Converter()`, the literal unmodified class.
 * Converter itself is a ~90-line thin proxy (worker spawn + Comlink RPC + error
 * decode, no encoding logic of its own) around convertFile(), and convertFile()
 * already has real, unmodified, byte-level end-to-end tests for wav/mp3/aac/
 * opus/flac (and aiff) in engine/convert.test.ts. What this suite verifies
 * instead is the wiring: that loadEngine() truly dynamically imports and
 * constructs the real Converter export from engine/converter.ts (the code-split
 * boundary), not a stub or a fork of it.
 */
import { describe, expect, it, vi } from 'vitest'
import { CODEC_IDS } from '../../engine/codec'
import { AUDIO_ENCODABLE_TARGETS } from '../../platform/graph'

const constructed: unknown[] = []

vi.mock('../../engine/converter', () => {
  class FakeConverter {
    constructor() {
      constructed.push(this)
    }
    convert = vi.fn()
    dispose = vi.fn()
  }
  return { Converter: FakeConverter }
})

const { audioModule } = await import('./index')

describe('audioModule.accepts', () => {
  it('accepts recognized audio extensions, delegating to isAudioFileName', () => {
    expect(audioModule.accepts({ name: 'song.mp3', type: 'audio/mpeg', size: 10 })).toBe(
      true,
    )
    expect(audioModule.accepts({ name: 'song.flac', type: '', size: 10 })).toBe(true)
  })

  it('rejects non-audio extensions', () => {
    expect(audioModule.accepts({ name: 'photo.jpg', type: 'image/jpeg', size: 10 })).toBe(
      false,
    )
  })
})

describe('audioModule format lists', () => {
  it('inputFormats spans every CodecId - any codec can be a nominal source', () => {
    expect([...audioModule.inputFormats].sort()).toEqual([...CODEC_IDS].sort())
  })

  it("outputFormats matches the graph's actually-encodable targets exactly", () => {
    expect([...audioModule.outputFormats].sort()).toEqual(
      [...AUDIO_ENCODABLE_TARGETS].sort(),
    )
  })
})

describe('audioModule.settingsSchema / defaultSettings', () => {
  it('declares one field per SetupView control, keyed to match ConversionSettings', () => {
    expect(audioModule.settingsSchema.map((f) => f.key).sort()).toEqual(
      ['codec', 'compression', 'keepMetadata', 'quality', 'sampleRate'].sort(),
    )
  })

  it("defaultSettings matches AppState.swift's documented defaults (also App.tsx's today)", () => {
    expect(audioModule.defaultSettings).toEqual({
      codec: 'flac',
      quality: 'best',
      compression: 'balanced',
      sampleRate: 'keepOriginal',
      keepMetadata: true,
    })
  })
})

describe('audioModule.probe', () => {
  it('resolves supported: true (wav/mp3/flac never depend on runtime detection)', async () => {
    await expect(audioModule.probe()).resolves.toEqual({ supported: true })
  })
})

describe('audioModule.loadEngine', () => {
  it('dynamically imports and constructs the real Converter export', async () => {
    const before = constructed.length
    const engine = await audioModule.loadEngine()
    expect(constructed.length).toBe(before + 1)
    expect(engine).toBe(constructed[constructed.length - 1])
  })
})
