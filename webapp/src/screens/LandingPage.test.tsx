import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage'

describe('LandingPage - setup screen', () => {
  it('shows the header, hero, privacy, and how-it-works sections, with the tool hidden until "Start converting" is clicked', () => {
    render(
      <LandingPage screen="setup">
        <p>the tool goes here</p>
      </LandingPage>,
    )
    expect(screen.getByText('Audio Converter')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your audio never leaves your device',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('the tool goes here')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Built around one rule: your files stay yours',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument()
    expect(
      screen.getByText('Free and open source.', { exact: false }),
    ).toBeInTheDocument()
  })

  it('reveals the tool once "Start converting" is clicked', () => {
    render(
      <LandingPage screen="setup">
        <p>the tool goes here</p>
      </LandingPage>,
    )
    expect(screen.queryByText('the tool goes here')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start converting' }))

    expect(screen.getByText('the tool goes here')).toBeInTheDocument()
  })

  it('scrolls to the tool again on a second click, after the user has scrolled back up to the hero', () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')
    render(
      <LandingPage screen="setup">
        <p>the tool goes here</p>
      </LandingPage>,
    )
    const startButton = screen.getByRole('button', { name: 'Start converting' })

    fireEvent.click(startButton)
    expect(scrollSpy).toHaveBeenCalledTimes(1)

    fireEvent.click(startButton)
    expect(scrollSpy).toHaveBeenCalledTimes(2)

    scrollSpy.mockRestore()
  })

  it('places privacy and how-it-works between the hero and the tool, so the tool never sits directly under the header', () => {
    const { container } = render(
      <LandingPage screen="setup">
        <p>the tool goes here</p>
      </LandingPage>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start converting' }))

    const text = container.textContent ?? ''
    const heroIndex = text.indexOf('Your audio never leaves your device')
    const privacyIndex = text.indexOf('Built around one rule')
    const howItWorksIndex = text.indexOf('How it works')
    const toolIndex = text.indexOf('the tool goes here')

    expect(heroIndex).toBeLessThan(privacyIndex)
    expect(privacyIndex).toBeLessThan(howItWorksIndex)
    expect(howItWorksIndex).toBeLessThan(toolIndex)
  })

  it('does not have a dedicated "why open source" section with its own link out', () => {
    render(
      <LandingPage screen="setup">
        <p>tool</p>
      </LandingPage>,
    )
    expect(
      screen.queryByRole('heading', { name: "Why it's open source" }),
    ).not.toBeInTheDocument()
    // Exactly one GitHub link on the page - the quiet footer mention, not a
    // pitched section.
    const githubLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.includes('github.com'))
    expect(githubLinks).toHaveLength(1)
    expect(githubLinks[0]).toHaveAttribute('target', '_blank')
    expect(githubLinks[0]).toHaveAttribute('rel', 'noreferrer')
  })
})

describe('LandingPage - convert screen', () => {
  it('hides the visible hero and marketing sections, keeping only the header and the tool, to stay focused on progress', () => {
    render(
      <LandingPage screen="convert">
        <p>converting now</p>
      </LandingPage>,
    )
    expect(screen.getAllByText('Audio Converter').length).toBeGreaterThan(0)
    expect(screen.getByText('converting now')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Your audio never leaves your device' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'How it works' }),
    ).not.toBeInTheDocument()
  })

  it('still has exactly one h1 in the accessibility tree, even with the visible hero hidden', () => {
    render(
      <LandingPage screen="convert">
        <p>converting now</p>
      </LandingPage>,
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
