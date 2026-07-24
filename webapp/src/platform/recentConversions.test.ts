import { beforeEach, describe, expect, it } from 'vitest'
import { getRecentConversions, recordRecentConversion } from './recentConversions'

beforeEach(() => {
  window.localStorage.clear()
})

describe('recentConversions', () => {
  it('starts empty', () => {
    expect(getRecentConversions()).toEqual([])
  })

  it('records a conversion as the most recent entry', () => {
    recordRecentConversion('wav-to-mp3')
    expect(getRecentConversions()).toEqual(['wav-to-mp3'])
  })

  it('moves a re-selected slug back to the front instead of duplicating it', () => {
    recordRecentConversion('wav-to-mp3')
    recordRecentConversion('flac-to-aac')
    recordRecentConversion('wav-to-mp3')
    expect(getRecentConversions()).toEqual(['wav-to-mp3', 'flac-to-aac'])
  })

  it('caps history at 5 entries, dropping the oldest', () => {
    for (const slug of ['a', 'b', 'c', 'd', 'e', 'f']) recordRecentConversion(slug)
    expect(getRecentConversions()).toEqual(['f', 'e', 'd', 'c', 'b'])
  })

  it('ignores malformed storage rather than throwing', () => {
    window.localStorage.setItem('audio-converter:recent-conversions', 'not json')
    expect(getRecentConversions()).toEqual([])
  })
})
