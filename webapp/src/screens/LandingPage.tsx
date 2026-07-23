/**
 * The marketing frame around the actual tool (SetupView/ConvertView, passed in as
 * children). Unlike the rest of screens/, this has no Swift source to port from -
 * the native app is a single window, it doesn't need a landing page. Sizing, copy,
 * and components here are new, not ported: type sizes reach for Tailwind's own
 * default scale (text-4xl and friends) rather than the small macOS-parity scale in
 * styles/tokens.css, and structural pieces (buttons, badges, cards) come from
 * src/components/ui (shadcn/ui) rather than the hand-rolled elements the rest of
 * the app uses - see index.css for how those are bridged onto this app's own
 * color tokens instead of shadcn's defaults.
 */
import type { ReactNode } from 'react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { ConversionDemo } from './ConversionDemo'

const GITHUB_URL = 'https://github.com/ankit4479/audio-converter'

export function LandingPage({
  screen,
  children,
}: {
  screen: 'setup' | 'convert'
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-surface-page">
      <SiteHeader />
      {screen === 'setup' ? (
        <Hero />
      ) : (
        // Hero (the page's only <h1>) is hidden on this screen to stay focused on
        // progress - this keeps one in the accessibility tree regardless, so a
        // screen reader user still lands on a heading rather than none at all.
        <h1 className="sr-only">Audio Converter</h1>
      )}
      <div id="tool">{children}</div>
      {screen === 'setup' && (
        <>
          <PrivacySection />
          <HowItWorksSection />
          <SiteFooter />
        </>
      )}
    </div>
  )
}

function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-[760px] items-center justify-between px-6 py-4">
        <span className="font-semibold text-text-primary">Audio Converter</span>
        <Badge variant="outline">Private by design</Badge>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <div className="mx-auto max-w-[760px] px-6 pb-12 pt-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
        Your audio never leaves your device
      </h1>
      <p className="mx-auto mt-4 max-w-[480px] text-lg text-text-secondary">
        Drop in a file, pick a format, get it back. No account, no upload, no catch.
      </p>
      <div className="mt-8 flex justify-center">
        <Button size="lg" asChild>
          <a href="#tool">Start converting</a>
        </Button>
      </div>
      <div className="mt-12">
        <ConversionDemo />
      </div>
    </div>
  )
}

const PRIVACY_POINTS = [
  {
    title: 'Nothing leaves your device',
    body: 'Every conversion happens right here, in this browser tab. Your files are never sent anywhere, not even to us.',
  },
  {
    title: 'Nothing is tracked',
    body: 'No account, no record of what you convert, no analytics watching your files.',
  },
  {
    title: 'Nothing to install',
    body: 'Open the page and go. No app to download, no permissions to grant.',
  },
]

function PrivacySection() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-16">
      <h2 className="text-center text-2xl font-semibold text-text-primary">
        Built around one rule: your files stay yours
      </h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {PRIVACY_POINTS.map((point) => (
          <Card key={point.title}>
            <CardContent>
              <h3 className="font-semibold text-text-primary">{point.title}</h3>
              <p className="mt-2 text-callout text-text-secondary">{point.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

const STEPS = [
  { title: 'Drop your files', body: 'A song, an album, or a whole folder.' },
  { title: 'Pick a format', body: 'MP3, FLAC, WAV, AAC, Opus, and more.' },
  { title: 'Get them back', body: 'Converted, right where you dropped them from.' },
]

function HowItWorksSection() {
  return (
    <div className="mx-auto max-w-[760px] px-6 pb-16">
      <h2 className="text-center text-2xl font-semibold text-text-primary">
        How it works
      </h2>
      <ol className="mt-8 grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="text-center">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-accent text-body-sm font-semibold text-accent-ink">
              {i + 1}
            </div>
            <h3 className="mt-3 font-semibold text-text-primary">{step.title}</h3>
            <p className="mt-1 text-callout text-text-secondary">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t border-border py-8 text-center text-caption text-text-secondary">
      Free and open source.{' '}
      <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline">
        View the code
      </a>
    </footer>
  )
}
