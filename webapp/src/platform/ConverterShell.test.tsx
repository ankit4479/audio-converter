import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'
import {
  sharedIntakeStore,
  _resetForTests as resetIntake,
} from '../intake/sharedIntakeStore'
import { audioModule } from '../modules/audio'
import { imageModule } from '../modules/image'
import ConversionRoute from '../routes/conversion'
import HubRoute from '../routes/hub'
import { ConversionController } from '../screens/ConversionController'
import { liveCategories } from './converterTargets'
import { allEdges, edgeToSlug, hubPath } from './graph'
import { register, _resetForTests as resetRegistry } from './registry'
import { _resetForTests as resetSettings } from './sharedSettings'

beforeEach(() => {
  resetRegistry()
  resetIntake()
  resetSettings()
  register(audioModule)
  register(imageModule)
})

/**
 * Mounts the real hub and conversion routes behind a memory history, so a target
 * change is exercised as the navigation it actually is - route match, component
 * remount, history entry and all - rather than against a mocked navigate(). A data
 * router (rather than MemoryRouter) is what makes the back button testable:
 * router.navigate(-1) pops its own history, while MemoryRouter ignores
 * window.history entirely.
 */
function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      // Every live category's hub, not just audio's - E2.1 (issue #31) added a second.
      ...liveCategories().map((category) => ({
        path: hubPath(category),
        element: <HubRoute />,
      })),
      ...allEdges().map((edge) => ({
        path: `/${edgeToSlug(edge.from, edge.to)}`,
        element: <ConversionRoute />,
      })),
    ],
    { initialEntries: [path] },
  )
  const view = render(<RouterProvider router={router} />)
  return { ...view, path: () => router.state.location.pathname, router }
}

/** Picks a format the way a mouse user does: the pointer press is what marks the
 *  choice as finished, so the change commits (and navigates) immediately. */
function pickTarget(codec: string) {
  const select = screen.getByLabelText('Convert to')
  fireEvent.pointerDown(select)
  fireEvent.change(select, { target: { value: codec } })
}

function addFiles(names: string[]) {
  act(() => {
    sharedIntakeStore(audioModule).addFiles(
      names.map((name) => ({ file: new File(['x'], name), relativePath: name })),
    )
  })
}

describe('ConverterShell - page chrome', () => {
  it('shows the tool immediately under a conversion-specific h1, with none of the home page pitch', () => {
    renderAt('/wav-to-mp3')

    expect(
      screen.getByRole('heading', { level: 1, name: 'WAV to MP3 Converter' }),
    ).toBeInTheDocument()
    // The tool is there without clicking anything - the "Start converting" gate is
    // gone, which is the whole point of #29's chrome reduction.
    expect(screen.getByText('Drag songs or folders here')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start converting' })).toBeNull()
    expect(
      screen.queryByRole('heading', {
        name: 'Built around one rule: your files stay yours',
      }),
    ).toBeNull()
    expect(screen.queryByRole('heading', { name: 'How it works' })).toBeNull()
    expect(
      screen.queryByRole('heading', { name: 'Your audio never leaves your device' }),
    ).toBeNull()
  })

  it('keeps the site header and footer, so a visitor can still reach every other converter', () => {
    renderAt('/wav-to-mp3')
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('gives a hub page the category h1 and its own converter selector', () => {
    renderAt(hubPath('audio'))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Audio Converter' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('What do you have?')).toBeInTheDocument()
    expect(screen.getByText('Drag songs or folders here')).toBeInTheDocument()
  })

  it('has exactly one h1 per page', () => {
    renderAt('/wav-to-mp3')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

describe('ConverterShell - target changes', () => {
  it('opens with the output format its URL promises', () => {
    renderAt('/wav-to-opus')
    expect(screen.getByLabelText('Convert to')).toHaveValue('opus')
  })

  it('navigates to the other conversion’s own page when the target changes, instead of swapping content in place', () => {
    const view = renderAt('/wav-to-mp3')
    expect(view.path()).toBe('/wav-to-mp3')

    pickTarget('aac')

    expect(view.path()).toBe('/wav-to-aac')
    expect(screen.getByLabelText('Convert to')).toHaveValue('aac')
    expect(
      screen.getByRole('heading', { level: 1, name: 'WAV to AAC Converter' }),
    ).toBeInTheDocument()
  })

  it('leaves the previous conversion in history, so the back button returns to it', async () => {
    const view = renderAt('/wav-to-mp3')
    pickTarget('aac')
    expect(view.path()).toBe('/wav-to-aac')

    await act(async () => {
      await view.router.navigate(-1)
    })

    expect(view.path()).toBe('/wav-to-mp3')
    expect(screen.getByLabelText('Convert to')).toHaveValue('mp3')
  })

  it('keeps the files across a target change, so nothing has to be dropped in twice', () => {
    const view = renderAt('/wav-to-mp3')
    addFiles(['a.wav', 'b.wav'])
    expect(screen.getByText('2 songs added')).toBeInTheDocument()

    pickTarget('flac')

    expect(view.path()).toBe('/wav-to-flac')
    expect(screen.getByText('2 songs added')).toBeInTheDocument()
  })

  it('keeps the settings the user tuned across a target change, so the batch runs with what they chose', () => {
    const view = renderAt('/wav-to-mp3')
    fireEvent.change(screen.getByLabelText('Sample rate'), {
      target: { value: 'hz48000' },
    })
    fireEvent.click(screen.getByLabelText('Song info and cover art'))

    pickTarget('aac')

    expect(view.path()).toBe('/wav-to-aac')
    // The remount that navigation causes must not quietly hand the conversion back
    // its defaults - the user would get 44.1 kHz with metadata after asking for
    // neither.
    expect(screen.getByLabelText('Sample rate')).toHaveValue('hz48000')
    expect(screen.getByLabelText('Song info and cover art')).not.toBeChecked()
  })

  it('never offers the page’s own source format as a target, since no such conversion exists to navigate to', () => {
    renderAt('/wav-to-mp3')
    const options = [...screen.getByLabelText<HTMLSelectElement>('Convert to').options]
    expect(options.map((option) => option.value)).not.toContain('wav')
    // Every other encodable format is still there - only the self-conversion is gone.
    expect(options.map((option) => option.value)).toContain('flac')
  })

  it('offers every format on a hub page, which has no source to exclude', () => {
    renderAt(hubPath('audio'))
    const options = [...screen.getByLabelText<HTMLSelectElement>('Convert to').options]
    expect(options.map((option) => option.value)).toContain('wav')
  })

  it('only changes settings on a hub page, which has no source format to pair the target with', () => {
    const view = renderAt(hubPath('audio'))

    pickTarget('flac')

    expect(view.path()).toBe(hubPath('audio'))
    expect(screen.getByLabelText('Convert to')).toHaveValue('flac')
  })
})

describe('ConverterShell - target changes by keyboard', () => {
  // On Windows/Linux Chrome and Firefox a closed <select> fires `change` for every
  // option the arrow keys pass over. Navigating on those would strand a keyboard
  // user on the first neighbouring format, so browsing must not navigate.
  it('follows the arrow keys without navigating, so a non-adjacent format stays reachable', () => {
    const view = renderAt('/wav-to-mp3')
    const select = screen.getByLabelText('Convert to')

    fireEvent.keyDown(select, { key: 'ArrowDown' })
    fireEvent.change(select, { target: { value: 'aac' } })
    fireEvent.keyDown(select, { key: 'ArrowDown' })
    fireEvent.change(select, { target: { value: 'flac' } })

    expect(view.path()).toBe('/wav-to-mp3')
    expect(select).toHaveValue('flac')
  })

  it('navigates once the keyboard pick is confirmed with Enter', () => {
    const view = renderAt('/wav-to-mp3')
    const select = screen.getByLabelText('Convert to')

    fireEvent.keyDown(select, { key: 'ArrowDown' })
    fireEvent.change(select, { target: { value: 'flac' } })
    fireEvent.keyDown(select, { key: 'Enter' })

    expect(view.path()).toBe('/wav-to-flac')
  })

  it('navigates when focus leaves the picker, for a keyboard user who tabs away instead', () => {
    const view = renderAt('/wav-to-mp3')
    const select = screen.getByLabelText('Convert to')

    fireEvent.keyDown(select, { key: 'ArrowDown' })
    fireEvent.change(select, { target: { value: 'opus' } })
    fireEvent.blur(select)

    expect(view.path()).toBe('/wav-to-opus')
  })

  it('does not push a history entry when the picker is left on the format the page is already for', () => {
    const view = renderAt('/wav-to-mp3')
    const select = screen.getByLabelText('Convert to')

    fireEvent.blur(select)
    fireEvent.pointerDown(select)
    fireEvent.change(select, { target: { value: 'mp3' } })

    expect(view.path()).toBe('/wav-to-mp3')
    expect(view.router.state.location.key).toBe('default')
  })
})

describe('ConverterShell - dropped files notice', () => {
  it('tells the user which files a converter could not take, rather than shortening the list silently', () => {
    renderAt('/wav-to-mp3')
    addFiles(['a.wav', 'b.wav'])

    // What arriving at a converter owned by another module does: the shared store
    // is retargeted, and the shell renders the count. No second real module exists
    // yet (#31+), so the swap is driven through the store directly.
    act(() => {
      sharedIntakeStore(audioModule).setModule({ accepts: () => false })
    })

    expect(screen.getByRole('status')).toHaveTextContent('2 files were removed')
    expect(screen.queryByText('2 songs added')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    // The live region itself stays mounted (that is what lets a screen reader
    // announce the next swap at all) - what goes away is its contents.
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('keeps the live region mounted before anything has been dropped, so the first announcement is not missed', () => {
    renderAt('/wav-to-mp3')
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})

describe('ConverterShell - engine lifecycle', () => {
  it('cancels the in-flight batch when the page is left, so its engines are disposed rather than leaked', () => {
    // cancel() is what lets BatchScheduler.run's `finally` dispose each worker
    // slot's engine (batchScheduler.test.ts asserts that disposal directly); this
    // checks the shell actually calls it on every way out of the page, including a
    // cross-module swap.
    const cancel = vi.spyOn(ConversionController.prototype, 'cancel')
    const view = renderAt('/wav-to-mp3')
    cancel.mockClear()

    view.unmount()

    expect(cancel).toHaveBeenCalledTimes(1)
    cancel.mockRestore()
  })
})

// E2.1 (issue #31): a second real module exists, so the shell's module-driven paths
// are exercised against one rather than only against fakes.
describe('ConverterShell - a second module', () => {
  it('drives an image conversion page with the image module’s own words and targets', () => {
    renderAt('/png-to-webp')

    expect(
      screen.getByRole('heading', { level: 1, name: 'PNG to WebP Converter' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Drag images or folders here')).toBeInTheDocument()
    expect(
      // Read from the module rather than restated, so its copy can change without
      // this test having to be edited in lockstep.
      screen.getByText(imageModule.presentation.intakeHint),
    ).toBeInTheDocument()
    const target = screen.getByLabelText<HTMLSelectElement>('Convert to')
    expect(target).toHaveValue('webp')
    // svg is a target too since E2.4 (issue #34): a PNG can be traced.
    expect([...target.options].map((o) => o.value).sort()).toEqual([
      'avif',
      'jpg',
      'svg',
      'webp',
    ])
  })

  it('renders the image settings from its schema, with no audio controls anywhere', () => {
    renderAt('/png-to-webp')
    // Quality comes from the schema through the shared panel.
    expect(screen.getByLabelText('Quality')).toHaveAttribute('type', 'range')
    // None of audio's bespoke panel leaks in.
    expect(screen.queryByText('Advanced settings')).toBeNull()
    expect(screen.queryByText('Song info and cover art')).toBeNull()
    expect(screen.queryByText('Sample rate')).toBeNull()
  })

  it('keeps audio pages on the audio panel, unchanged', () => {
    renderAt('/wav-to-mp3')
    expect(screen.getByText('Drag songs or folders here')).toBeInTheDocument()
    expect(screen.getByText('Advanced settings')).toBeInTheDocument()
    // Audio has a Quality control of its own, but it is its bespoke <select> of
    // named tiers - not a schema-driven slider, which is what would mean the generic
    // panel had taken over.
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByLabelText('Quality').tagName).toBe('SELECT')
  })

  it('navigates between image conversions the same way audio does', () => {
    const view = renderAt('/png-to-webp')
    pickTarget('avif')
    expect(view.path()).toBe('/png-to-avif')
    expect(screen.getByLabelText('Convert to')).toHaveValue('avif')
  })

  it('offers the whole image category on the image hub, which has no source to exclude', () => {
    renderAt(hubPath('image'))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Image Converter' }),
    ).toBeInTheDocument()
    const target = screen.getByLabelText<HTMLSelectElement>('Convert to')
    expect([...target.options].map((o) => o.value).sort()).toEqual([
      'avif',
      'jpg',
      'png',
      'svg',
      'webp',
    ])
  })
})
