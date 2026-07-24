import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileIntakeStore } from '../intake/FileIntakeStore'
import { audioModule } from '../modules/audio'
import { SetupView, type SetupSettings } from './SetupView'

const DEFAULT_SETTINGS: SetupSettings = {
  codec: 'flac',
  quality: 'best',
  compression: 'balanced',
  sampleRate: 'keepOriginal',
  keepMetadata: true,
}

function renderSetup(overrides: Partial<Parameters<typeof SetupView>[0]> = {}) {
  const store = new FileIntakeStore(audioModule)
  const onSettingsChange = vi.fn()
  const onConvert = vi.fn()
  const props = {
    store,
    files: [],
    totalDuration: 0,
    isCalculatingDuration: false,
    settings: DEFAULT_SETTINGS,
    onSettingsChange,
    onConvert,
    ...overrides,
  }
  const view = render(<SetupView {...props} />)
  return { ...view, store, onSettingsChange, onConvert, props }
}

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mql = {
    media: '(prefers-reduced-motion: reduce)',
    get matches() {
      return mql.currentMatches
    },
    currentMatches: matches,
    addEventListener: (_: 'change', listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    },
    removeEventListener: (
      _: 'change',
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.delete(listener)
    },
  } as unknown as MediaQueryList & { currentMatches: boolean }
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
  return {
    fireChange: (nextMatches: boolean) => {
      ;(mql as unknown as { currentMatches: boolean }).currentMatches = nextMatches
      listeners.forEach((listener) =>
        listener({ matches: nextMatches } as MediaQueryListEvent),
      )
    },
  }
}

describe('SetupView - waveform reduced-motion path (SetupView.swift:244)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('animates at 55% height when the OS has no reduced-motion preference', () => {
    mockMatchMedia(false)
    const { container } = renderSetup()
    const bars = container.querySelectorAll('.animate-waveform')
    expect(bars).toHaveLength(9)
    expect((bars[0] as HTMLElement).style.height).toBe(`${14 * 0.55}px`)
  })

  it('renders at full height with no animation class when the OS prefers reduced motion', () => {
    mockMatchMedia(true)
    const { container } = renderSetup()
    expect(container.querySelectorAll('.animate-waveform')).toHaveLength(0)
    const bars = container.querySelectorAll('.bg-accent\\/75')
    expect((bars[0] as HTMLElement).style.height).toBe('14px')
  })

  it('switches to the reduced-motion rendering when the preference changes live', () => {
    const { fireChange } = mockMatchMedia(false)
    const { container } = renderSetup()
    expect(container.querySelectorAll('.animate-waveform')).toHaveLength(9)

    act(() => fireChange(true))

    expect(container.querySelectorAll('.animate-waveform')).toHaveLength(0)
  })
})

describe('SetupView - drop zone', () => {
  it('matches the exact copy from SetupView.swift', () => {
    renderSetup()
    expect(screen.getByText('Drag songs or folders here')).toBeInTheDocument()
    expect(
      screen.getByText(
        'MP3, FLAC, WAV, AAC, ALAC, Opus, and more. Mixed formats are fine.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Choose Files or a Folder' }),
    ).toBeInTheDocument()
  })
})

describe('SetupView - files bar singular/plural (SetupView.swift:107)', () => {
  it('says "1 song added" for exactly one file', () => {
    const file = {
      id: '1',
      file: new File(['x'], 'a.mp3'),
      relativePath: 'a.mp3',
      fileSize: 1,
      displayName: 'a.mp3',
    }
    renderSetup({ files: [file] })
    expect(screen.getByText('1 song added')).toBeInTheDocument()
  })

  it('says "2 songs added" for more than one file', () => {
    const files = [
      {
        id: '1',
        file: new File(['x'], 'a.mp3'),
        relativePath: 'a.mp3',
        fileSize: 1,
        displayName: 'a.mp3',
      },
      {
        id: '2',
        file: new File(['x'], 'b.mp3'),
        relativePath: 'b.mp3',
        fileSize: 1,
        displayName: 'b.mp3',
      },
    ]
    renderSetup({ files })
    expect(screen.getByText('2 songs added')).toBeInTheDocument()
  })

  it('shows nothing (no files bar) when the list is empty', () => {
    renderSetup({ files: [] })
    expect(screen.queryByText(/song.*added/)).not.toBeInTheDocument()
  })

  it('the "Clear all" link clears the store', () => {
    const file = {
      id: '1',
      file: new File(['x'], 'a.mp3'),
      relativePath: 'a.mp3',
      fileSize: 1,
      displayName: 'a.mp3',
    }
    const { store } = renderSetup({ files: [file] })
    const clearSpy = vi.spyOn(store, 'clear')
    fireEvent.click(screen.getByText('Clear all'))
    expect(clearSpy).toHaveBeenCalled()
  })
})

describe('SetupView - advanced settings caption switches by codec kind (SetupView.swift:182-204)', () => {
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

describe('SetupView - convert button (SetupView.swift:223-242)', () => {
  it('reads "Convert" and is disabled when there are no files', () => {
    renderSetup({ files: [] })
    const button = screen.getByRole('button', { name: 'Convert' })
    expect(button).toBeDisabled()
  })

  it('reads "Convert 1 Song" for exactly one file and is enabled', () => {
    const file = {
      id: '1',
      file: new File(['x'], 'a.mp3'),
      relativePath: 'a.mp3',
      fileSize: 1,
      displayName: 'a.mp3',
    }
    renderSetup({ files: [file] })
    const button = screen.getByRole('button', { name: 'Convert 1 Song' })
    expect(button).toBeEnabled()
  })

  it('reads "Convert 3 Songs" (plural) for more than one file', () => {
    const files = [1, 2, 3].map((n) => ({
      id: String(n),
      file: new File(['x'], `${n}.mp3`),
      relativePath: `${n}.mp3`,
      fileSize: 1,
      displayName: `${n}.mp3`,
    }))
    renderSetup({ files })
    expect(screen.getByRole('button', { name: 'Convert 3 Songs' })).toBeInTheDocument()
  })

  it('calls onConvert when clicked', () => {
    const file = {
      id: '1',
      file: new File(['x'], 'a.mp3'),
      relativePath: 'a.mp3',
      fileSize: 1,
      displayName: 'a.mp3',
    }
    const { onConvert } = renderSetup({ files: [file] })
    fireEvent.click(screen.getByRole('button', { name: 'Convert 1 Song' }))
    expect(onConvert).toHaveBeenCalled()
  })
})

describe('SetupView - format picker only lists what this browser can actually produce', () => {
  // jsdom has no real WebCodecs, so canEncodeAudio always resolves false here once
  // the async detection effect settles - AAC/Opus (runtimeDetected) drop out along
  // with the permanently-unsupported ALAC/WavPack/WMA/Vorbis, leaving only the
  // formats with a real encoder path in this environment: MP3 (WASM), FLAC (WASM
  // fallback), WAV (no codec needed), AIFF (hand-written writer).
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
    expect(optionValues(select)).not.toContain('vorbis')
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
      expect(optionValues(select).sort()).toEqual(['aiff', 'flac', 'mp3', 'wav'])
    })
    const groups = Array.from(select.children).filter(
      (el): el is HTMLOptGroupElement => el.tagName === 'OPTGROUP',
    )
    expect(groups.find((g) => g.label === 'Common')!.children).toHaveLength(3) // mp3, flac, wav
    expect(groups.find((g) => g.label === 'More Formats')!.children).toHaveLength(1) // aiff
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
