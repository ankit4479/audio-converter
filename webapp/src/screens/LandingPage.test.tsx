import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LandingPage } from './LandingPage'

describe('LandingPage - setup screen', () => {
  it('shows the header, hero, and explainer sections around the tool', () => {
    render(
      <LandingPage screen="setup">
        <p>the tool goes here</p>
      </LandingPage>,
    )
    expect(screen.getByText('Audio Converter')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Convert audio without uploading it anywhere',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('the tool goes here')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How this works' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: "Why it's open source" }),
    ).toBeInTheDocument()
    expect(screen.getByText('MIT licensed.', { exact: false })).toBeInTheDocument()
  })

  it('links to the GitHub repo and the macOS releases page', () => {
    render(
      <LandingPage screen="setup">
        <p>tool</p>
      </LandingPage>,
    )
    const githubLinks = screen.getAllByRole('link', { name: /view source|github/i })
    expect(githubLinks.length).toBeGreaterThan(0)
    for (const link of githubLinks) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer')
    }
    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'href',
      'https://github.com/ankit4479/audio-converter/releases',
    )
  })
})

describe('LandingPage - convert screen', () => {
  it('hides the visible hero and explainer sections, keeping only the header, to stay focused on progress', () => {
    render(
      <LandingPage screen="convert">
        <p>converting now</p>
      </LandingPage>,
    )
    expect(screen.getAllByText('Audio Converter').length).toBeGreaterThan(0)
    expect(screen.getByText('converting now')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: 'Convert audio without uploading it anywhere',
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'How this works' }),
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
