import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App'

describe('App', () => {
  it('renders the landing page hero by default, with the Setup screen hidden until "Start converting" is clicked', () => {
    // CommandPalette (#27), rendered via LandingPage's SiteHeader, uses
    // react-router's useNavigate - needs a Router context to mount.
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your audio never leaves your device',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Drag songs or folders here')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start converting' }))

    expect(screen.getByText('Drag songs or folders here')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Choose Files or a Folder' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Convert' })).toBeDisabled()
  })
})
