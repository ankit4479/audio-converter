import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import { audioModule } from '../modules/audio'
import { register, _resetForTests } from './registry'
import { HowItWorksSection, PrivacySection, SiteFooter, SiteHeader } from './SiteChrome'

// SiteHeader mounts MegaMenu/MegaMenuDrawer (registry-driven) and CommandPalette
// (which uses react-router's useNavigate), so it needs both a registered module and
// a Router context.
beforeEach(() => {
  _resetForTests()
  register(audioModule)
})

function renderChrome(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>)
}

describe('SiteChrome', () => {
  it('names the site and offers the nav and search in the header', () => {
    renderChrome(<SiteHeader />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByText('Audio Converter')).toBeInTheDocument()
    expect(screen.getByLabelText('Converter categories')).toBeInTheDocument()
  })

  it('states the privacy argument and the three steps', () => {
    renderChrome(
      <>
        <PrivacySection />
        <HowItWorksSection />
      </>,
    )
    expect(
      screen.getByRole('heading', {
        name: 'Built around one rule: your files stay yours',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument()
  })

  it('mentions the source once, quietly in the footer, rather than pitching it as a section', () => {
    renderChrome(<SiteFooter />)
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    const githubLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.includes('github.com'))
    expect(githubLinks).toHaveLength(1)
    expect(githubLinks[0]).toHaveAttribute('target', '_blank')
    expect(githubLinks[0]).toHaveAttribute('rel', 'noreferrer')
  })
})
