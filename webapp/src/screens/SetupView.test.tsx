import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileIntakeStore } from '../intake/FileIntakeStore'
import { audioModule } from '../modules/audio'
import { SetupView } from './SetupView'

// Since E2.1 (issue #31) SetupView is the module-agnostic layout: the settings are a
// node it renders, and its wording comes from the module's presentation. These tests
// cover the layout with audio's presentation (so the assertions are the same copy
// they always were); the audio controls themselves are AudioSettings.test.tsx.
function renderSetup(overrides: Partial<Parameters<typeof SetupView>[0]> = {}) {
  const store = new FileIntakeStore(audioModule)
  const onConvert = vi.fn()
  const props = {
    store,
    files: [],
    totalDuration: 0,
    isCalculatingDuration: false,
    settings: <p>settings go here</p>,
    presentation: audioModule.presentation,
    category: audioModule.category,
    onConvert,
    ...overrides,
  }
  const view = render(<SetupView {...props} />)
  return { ...view, store, onConvert, props }
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

describe('SetupView - module-driven wording (E2.1, issue #31)', () => {
  const IMAGE_PRESENTATION = {
    item: { singular: 'image', plural: 'images' },
    intakeHint: 'PNG, JPG, WebP, and AVIF.',
    tracksDuration: false,
  }

  function imageFiles(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: String(i),
      file: new File(['x'], `${i}.png`),
      relativePath: `${i}.png`,
      fileSize: 1,
      displayName: `${i}.png`,
    }))
  }

  it('names the files the way the module does, in the drop zone, the bar, and the button', () => {
    renderSetup({
      presentation: IMAGE_PRESENTATION,
      category: 'image',
      files: imageFiles(2),
    })
    expect(screen.getByText('Drag images or folders here')).toBeInTheDocument()
    expect(screen.getByText('PNG, JPG, WebP, and AVIF.')).toBeInTheDocument()
    expect(screen.getByText('2 images added')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Convert 2 Images' })).toBeInTheDocument()
  })

  it('uses the singular for one file', () => {
    renderSetup({
      presentation: IMAGE_PRESENTATION,
      category: 'image',
      files: imageFiles(1),
    })
    expect(screen.getByText('1 image added')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Convert 1 Image' })).toBeInTheDocument()
  })

  it('shows no playing time for files that have none, rather than a stray 0', () => {
    renderSetup({
      presentation: IMAGE_PRESENTATION,
      category: 'image',
      files: imageFiles(2),
      totalDuration: 0,
      isCalculatingDuration: true,
    })
    expect(screen.queryByText(/calculating/i)).toBeNull()
    expect(screen.queryByText(/second|minute/i)).toBeNull()
  })

  it('renders whatever settings node it is given, wherever the module comes from', () => {
    renderSetup({ settings: <p>image settings</p> })
    expect(screen.getByText('image settings')).toBeInTheDocument()
  })
})
