import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AudioSettings } from './AudioSettings'
import type { SetupSettings } from './SetupView'

// These moved out of SetupView.test.tsx in E2.1 (issue #31), when SetupView became
// the module-agnostic layout and audio's own controls became this component. The
// assertions are unchanged - the audio panel is meant to behave exactly as it did.
const DEFAULT_SETTINGS: SetupSettings = {
  codec: 'flac',
  quality: 'best',
  compression: 'balanced',
  sampleRate: 'keepOriginal',
  keepMetadata: true,
}

function renderSetup(overrides: Partial<Parameters<typeof AudioSettings>[0]> = {}) {
  const onSettingsChange = vi.fn()
  const onTargetCommit = vi.fn()
  const props = {
    settings: DEFAULT_SETTINGS,
    onSettingsChange,
    onTargetCommit,
    ...overrides,
  }
  const view = render(<AudioSettings {...props} />)
  return { ...view, onSettingsChange, onTargetCommit, props }
}

describe('AudioSettings - advanced settings caption switches by codec kind (SetupView.swift:182-204)', () => {
  it('shows the lossy explanation and Quality picker for a lossy codec', () => {
    renderSetup({ settings: { ...DEFAULT_SETTINGS, codec: 'mp3' } })
    fireEvent.click(screen.getByText('Advanced settings'))
    expect(
      screen.getByText(/Best is tuned so the compression is not audible/),
    ).toBeInTheDocument()
    expect(screen.getByText('Quality')).toBeInTheDocument()
    expect(screen.queryByText('Compression')).not.toBeInTheDocument()
  })

  it('shows the lossless explanation and Compression picker for a lossless codec that supports it', () => {
    renderSetup({ settings: { ...DEFAULT_SETTINGS, codec: 'flac' } })
    fireEvent.click(screen.getByText('Advanced settings'))
    expect(
      screen.getByText(/Lossless formats always sound identical/),
    ).toBeInTheDocument()
    expect(screen.getByText('Compression')).toBeInTheDocument()
  })

  it('hides the Compression row for ALAC, which has no tunable level (Codec.swift:156-161)', () => {
    renderSetup({ settings: { ...DEFAULT_SETTINGS, codec: 'alac' } })
    fireEvent.click(screen.getByText('Advanced settings'))
    expect(
      screen.getByText(/Lossless formats always sound identical/),
    ).toBeInTheDocument()
    expect(screen.queryByText('Compression')).not.toBeInTheDocument()
  })

  it('shows the uncompressed explanation and no quality/compression picker for WAV', () => {
    renderSetup({ settings: { ...DEFAULT_SETTINGS, codec: 'wav' } })
    fireEvent.click(screen.getByText('Advanced settings'))
    expect(screen.getByText(/WAV and AIFF store audio exactly as-is/)).toBeInTheDocument()
    expect(screen.queryByText('Quality')).not.toBeInTheDocument()
    expect(screen.queryByText('Compression')).not.toBeInTheDocument()
  })

  it('always shows Sample rate and the metadata switch regardless of codec kind', () => {
    renderSetup({ settings: { ...DEFAULT_SETTINGS, codec: 'wav' } })
    fireEvent.click(screen.getByText('Advanced settings'))
    expect(screen.getByText('Sample rate')).toBeInTheDocument()
    expect(screen.getByText('Song info and cover art')).toBeInTheDocument()
  })
})

describe('AudioSettings - format picker only lists what this browser can actually produce', () => {
  // jsdom has no real WebCodecs, so canEncodeAudio always resolves false here once
  // the async detection effect settles - AAC/Opus (runtimeDetected) drop out along
  // with the permanently-unsupported ALAC/WavPack/WMA, leaving only the formats
  // with a real encoder path in this environment: MP3 (WASM), FLAC (WASM
  // fallback), WAV (no codec needed), AIFF and Vorbis (hand-written writers).
  function optionValues(select: HTMLSelectElement): string[] {
    return Array.from(select.options).map((o) => o.value)
  }

  it('never shows the permanently-unsupported formats at all, not even disabled', async () => {
    renderSetup()
    const select = screen.getByLabelText('Convert to') as HTMLSelectElement
    await waitFor(() => {
      expect(optionValues(select)).not.toContain('alac')
    })
    expect(optionValues(select)).not.toContain('wavpack')
    expect(optionValues(select)).not.toContain('wma')
  })

  it('drops runtime-detected formats once detection confirms this browser lacks them', async () => {
    renderSetup()
    const select = screen.getByLabelText('Convert to') as HTMLSelectElement
    await waitFor(() => {
      expect(optionValues(select)).not.toContain('aac')
      expect(optionValues(select)).not.toContain('opus')
    })
  })

  it('keeps every genuinely-available format, still grouped correctly', async () => {
    renderSetup()
    const select = screen.getByLabelText('Convert to') as HTMLSelectElement
    await waitFor(() => {
      expect(optionValues(select).sort()).toEqual([
        'aiff',
        'flac',
        'mp3',
        'vorbis',
        'wav',
      ])
    })
    const groups = Array.from(select.children).filter(
      (el): el is HTMLOptGroupElement => el.tagName === 'OPTGROUP',
    )
    expect(groups.find((g) => g.label === 'Common')!.children).toHaveLength(3) // mp3, flac, wav
    expect(groups.find((g) => g.label === 'More Formats')!.children).toHaveLength(2) // aiff, vorbis
  })

  it('falls back to a still-available codec if the selected one drops out of the list', async () => {
    // aac is optimistically shown as available before detection resolves, then
    // removed once it does - the selection must not silently keep pointing at a
    // now-hidden option. renderSetup's onSettingsChange is a plain mock (this is a
    // controlled component; the real state lives in the parent, App.tsx), so this
    // checks that the fallback was requested, not the DOM's own value resolution.
    const { onSettingsChange } = renderSetup({
      settings: { ...DEFAULT_SETTINGS, codec: 'aac' },
    })
    await waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          codec: expect.stringMatching(/^(mp3|flac|wav|aiff)$/),
        }),
      )
    })
  })
})
