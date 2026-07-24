import { beforeEach, describe, expect, it } from 'vitest'
import type { ConverterModule } from './module'
import { _resetForTests, all, byCategory, get, register } from './registry'

function fakeModule(
  id: string,
  category: ConverterModule['category'] = 'audio',
): ConverterModule {
  return {
    id,
    category,
    label: id,
    accepts: () => true,
    inputFormats: [],
    outputFormats: [],
    settingsSchema: [],
    defaultSettings: {},
    probe: async () => ({ supported: true }),
    loadEngine: async () => ({
      convert: async () => ({ blob: new Blob(), fileName: '' }),
      dispose: () => {},
    }),
  }
}

beforeEach(() => {
  _resetForTests()
})

describe('register / get', () => {
  it('registers a module and makes it retrievable by id', () => {
    register(fakeModule('audio'))
    expect(get('audio')?.id).toBe('audio')
  })

  it('returns undefined for an id that was never registered', () => {
    expect(get('missing')).toBeUndefined()
  })

  it('throws on a duplicate id rather than silently overwriting', () => {
    register(fakeModule('audio'))
    expect(() => register(fakeModule('audio'))).toThrow(/already registered/)
  })
})

describe('all / byCategory', () => {
  it('all() lists every registered module', () => {
    register(fakeModule('audio'))
    register(fakeModule('image', 'image'))
    expect(
      all()
        .map((m) => m.id)
        .sort(),
    ).toEqual(['audio', 'image'])
  })

  it('byCategory() filters to just that category', () => {
    register(fakeModule('audio'))
    register(fakeModule('image', 'image'))
    expect(byCategory('audio').map((m) => m.id)).toEqual(['audio'])
    expect(byCategory('video')).toEqual([])
  })
})
