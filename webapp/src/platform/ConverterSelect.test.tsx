import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import { audioModule } from '../modules/audio'
import { ConverterSelect } from './ConverterSelect'
import { register, _resetForTests } from './registry'

beforeEach(() => {
  _resetForTests()
  register(audioModule)
})

function renderSelect(props: Parameters<typeof ConverterSelect>[0] = {}) {
  return render(
    <MemoryRouter>
      <ConverterSelect {...props} />
    </MemoryRouter>,
  )
}

describe('ConverterSelect', () => {
  it('offers the targets of a preselected source straight away, so the control explains itself untouched', () => {
    renderSelect()
    const source = screen.getByLabelText('What do you have?')
    expect(source).toHaveValue('mp3')
    expect(screen.getByRole('link', { name: 'FLAC' })).toBeInTheDocument()
  })

  it('renders every target as a real link to that conversion’s own page, not a click handler', () => {
    renderSelect()
    // The href is the whole point: a crawler follows an href, and one indexable
    // page per conversion is why those URLs exist at all (#25, #29).
    expect(screen.getByRole('link', { name: 'WAV' })).toHaveAttribute(
      'href',
      '/mp3-to-wav',
    )
  })

  it('swaps the target list when the source changes', () => {
    renderSelect()
    expect(screen.queryByRole('link', { name: 'MP3' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('What do you have?'), {
      target: { value: 'wav' },
    })

    expect(screen.getByRole('link', { name: 'MP3' })).toHaveAttribute(
      'href',
      '/wav-to-mp3',
    )
    // wav can't convert to itself, so it is not among its own targets.
    expect(screen.queryByRole('link', { name: 'WAV' })).not.toBeInTheDocument()
  })

  it('offers a source that has no encoder as an input, since that is what people actually have', () => {
    renderSelect()
    fireEvent.change(screen.getByLabelText('What do you have?'), {
      target: { value: 'alac' },
    })
    expect(screen.getByRole('link', { name: 'MP3' })).toHaveAttribute(
      'href',
      '/alac-to-mp3',
    )
  })

  it('renders nothing when no category is live, rather than an empty picker', () => {
    _resetForTests()
    const { container } = renderSelect()
    expect(container).toBeEmptyDOMElement()
  })

  it('limits its sources to the given category', () => {
    renderSelect({ category: 'image' })
    expect(screen.queryByLabelText('What do you have?')).not.toBeInTheDocument()
  })
})
