/**
 * The marketing frame around the actual tool (SetupView/ConvertView, passed in as
 * children). Unlike the rest of screens/, this has no Swift source to port from -
 * the native app is a single window, it doesn't need a landing page. Sizing and
 * copy here are new, not ported, so they intentionally don't use the small
 * macOS-parity type scale in styles/tokens.css (text-body, text-title, etc.) - this
 * reaches for Tailwind's own default scale (text-4xl and friends) instead.
 */
import type { ReactNode } from 'react'

const GITHUB_URL = 'https://github.com/ankit4479/audio-converter'
const MACOS_RELEASES_URL = 'https://github.com/ankit4479/audio-converter/releases'

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
      {children}
      {screen === 'setup' && (
        <>
          <ExplainerSection />
          <SiteFooter />
        </>
      )}
    </div>
  )
}

function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-[680px] items-center justify-between px-6 py-4">
        <span className="font-semibold text-text-primary">Audio Converter</span>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="text-callout text-text-secondary underline"
        >
          View source
        </a>
      </div>
    </header>
  )
}

const FEATURES = [
  'No upload, ever',
  'Convert a whole folder at once',
  'MIT licensed, source on GitHub',
]

function Hero() {
  return (
    <div className="mx-auto max-w-[680px] px-6 pb-10 pt-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
        Convert audio without uploading it anywhere
      </h1>
      <p className="mx-auto mt-4 max-w-[480px] text-lg text-text-secondary">
        Drop in MP3, FLAC, WAV, AAC, or Opus files, pick a format, and get them back
        converted. Everything runs in this browser tab, and nothing you drop in ever
        leaves your machine.
      </p>
      <ul className="mt-6 flex flex-wrap justify-center gap-2">
        {FEATURES.map((feature) => (
          <li
            key={feature}
            className="rounded-full border border-border px-3 py-1 text-callout text-text-secondary"
          >
            {feature}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ExplainerSection() {
  return (
    <div className="mx-auto max-w-[680px] space-y-10 px-6 py-16">
      <section>
        <h2 className="text-2xl font-semibold text-text-primary">How this works</h2>
        <p className="mt-3 text-body text-text-secondary">
          Conversion runs on WebCodecs, the same low-level encoding API built into your
          browser that video editors and streaming apps use. For the one format browsers
          don't ship an encoder for, MP3, a small WebAssembly encoder fills the gap, and
          it only downloads once you actually pick MP3. There's no server on the other end
          of this waiting for your files. If you turn off your Wi-Fi mid-conversion, it
          keeps working.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold text-text-primary">Why it's open source</h2>
        <p className="mt-3 text-body text-text-secondary">
          The full source for this page, and for a native macOS app built on ffmpeg with a
          few more formats than a browser can encode, is on{' '}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline">
            GitHub
          </a>{' '}
          under the MIT license. Read it, run it yourself, or send a fix. If you'd rather
          have the desktop version, it's in{' '}
          <a
            href={MACOS_RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Releases
          </a>
          .
        </p>
      </section>
    </div>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t border-border py-8 text-center text-caption text-text-secondary">
      MIT licensed.{' '}
      <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline">
        ankit4479/audio-converter
      </a>
    </footer>
  )
}
