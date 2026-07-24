import { describe, expect, it } from 'vitest'
import type { Converter } from '../engine/converter'
import type { ConversionSettings } from '../engine/codec'
import type { ConverterEngine, ConverterModule, FileMeta, SettingField } from './module'

describe('ConverterEngine', () => {
  it('the existing audio Converter class structurally satisfies ConverterEngine<ConversionSettings>', () => {
    // Compile-time assertion: this file fails `tsc -b` if Converter's convert()/
    // dispose() shape ever drifts from the ConverterEngine contract - exactly the
    // guarantee E0.3 (#23) needs before wrapping Converter as the audio module's
    // engine. No instance is constructed (that would spawn a real Worker); the
    // check is purely structural.
    //
    // Parameterized by ConversionSettings, not left as the bare `ConverterEngine`
    // default: ConversionSettings is a plain interface with no index signature, so
    // it isn't structurally assignable to `Record<string, unknown>` - confirmed by
    // trying that first and watching this same assertion fail under `tsc -b`.
    type _AssertConverterIsEngine =
      Converter extends ConverterEngine<ConversionSettings> ? true : false
    const satisfies: _AssertConverterIsEngine = true
    expect(satisfies).toBe(true)
  })
})

describe('SettingField', () => {
  it('each kind carries only the fields it needs', () => {
    const fields: SettingField[] = [
      {
        kind: 'select',
        key: 'codec',
        label: 'Format',
        options: [{ value: 'mp3', label: 'MP3' }],
      },
      { kind: 'slider', key: 'quality', label: 'Quality', min: 0, max: 100, step: 1 },
      { kind: 'toggle', key: 'keepMetadata', label: 'Keep metadata' },
      { kind: 'color', key: 'background', label: 'Background' },
    ]
    expect(fields.map((f) => f.kind)).toEqual(['select', 'slider', 'toggle', 'color'])
  })
})

describe('ConverterModule', () => {
  function makeFakeModule(onDispose: () => void): ConverterModule {
    return {
      id: 'fake',
      category: 'audio',
      label: 'Fake',
      accepts: (f) => f.name.endsWith('.mp3'),
      inputFormats: ['mp3'],
      outputFormats: ['wav'],
      settingsSchema: [],
      defaultSettings: {},
      probe: async () => ({ supported: true }),
      loadEngine: async () => {
        const engine: ConverterEngine = {
          convert: async (_file, baseName) => ({
            blob: new Blob(['x']),
            fileName: `${baseName}.wav`,
          }),
          dispose: onDispose,
        }
        return engine
      },
    }
  }

  it('accepts() filters by the module-provided predicate', () => {
    const fakeModule = makeFakeModule(() => {})
    const file: FileMeta = { name: 'a.mp3', type: 'audio/mpeg', size: 10 }
    expect(fakeModule.accepts(file)).toBe(true)
    expect(fakeModule.accepts({ name: 'a.txt', type: 'text/plain', size: 1 })).toBe(false)
  })

  it('probe() and loadEngine() are awaitable and the resulting engine runs end to end', async () => {
    let disposed = false
    const fakeModule = makeFakeModule(() => {
      disposed = true
    })

    const capability = await fakeModule.probe()
    expect(capability.supported).toBe(true)

    const engine = await fakeModule.loadEngine()
    const result = await engine.convert(
      new Blob(['x']),
      'track',
      fakeModule.defaultSettings,
    )
    expect(result.fileName).toBe('track.wav')

    expect(disposed).toBe(false)
    engine.dispose()
    expect(disposed).toBe(true)
  })
})
