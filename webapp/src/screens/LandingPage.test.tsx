import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LandingPage } from './LandingPage'

describe('LandingPage - setup screen', () => {
  it('shows the header, hero, privacy, and how-it-works sections around the tool', () => {
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
    expect(screen.getByText('the tool goes here')).toBeInTheDocument()
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

  it('the "Start converting" button anchors straight to the tool', () => {
    render(
      <LandingPage screen="setup">
        <p>tool</p>
      </LandingPage>,
    )
    expect(screen.getByRole('link', { name: 'Start converting' })).toHaveAttribute(
      'href',
      '#tool',
    )
  })
})

describe('LandingPage - convert screen', () => {
  it('hides the visible hero and marketing sections, keeping only the header, to stay focused on progress', () => {
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
