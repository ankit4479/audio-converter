import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import { audioModule } from '../modules/audio'
import { hubPath } from './graph'
import { HomePage } from './HomePage'
import { register, _resetForTests } from './registry'

beforeEach(() => {
  _resetForTests()
  register(audioModule)
})

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  it('keeps the full pitch, which the hub and conversion pages no longer repeat', () => {
    renderHome()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Convert anything. Nothing leaves your device.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Built around one rule: your files stay yours',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument()
  })

  it('offers all three ways in: search, the converter selector, and the category grid', () => {
    renderHome()
    expect(
      screen.getByPlaceholderText(/what do you want to convert/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('What do you have?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Audio/ })).toHaveAttribute(
      'href',
      hubPath('audio'),
    )
  })

  it('shows the conversion demo, which moved here when the converter pages dropped their hero', () => {
    renderHome()
    expect(
      screen.getByRole('img', { name: /A FLAC file being converted into an MP3/ }),
    ).toBeInTheDocument()
  })

  it('shows no converter tool - it is a discovery page, not a converter', () => {
    renderHome()
    expect(screen.queryByText('Drag songs or folders here')).toBeNull()
  })
})
