/**
 * The site's shared page furniture: header, footer, and the two marketing blocks
 * (privacy, how-it-works) that only the home page still shows.
 *
 * Was the top half of screens/LandingPage.tsx, which also owned a hero and a
 * "Start converting" click gate and wrapped every widget page in both. Since
 * E1.5 (issue #29) the hub and per-conversion pages render their tool
 * immediately under their own h1 (ConverterShell) and the home page is the only
 * page that pitches (HomePage), so there is no longer a single frame both share
 * - only these pieces. Sizing and copy are unchanged from LandingPage.
 *
 * Type sizes here reach for Tailwind's own default scale (text-4xl and friends)
 * rather than the small macOS-parity scale in styles/tokens.css, and structural
 * pieces (buttons, badges, cards) come from src/components/ui (shadcn/ui) rather
 * than the hand-rolled elements the converter itself uses - see index.css for how
 * those are bridged onto this app's own color tokens instead of shadcn's
 * defaults.
 */
import { Badge } from '../components/ui/badge'
import { Card, CardContent } from '../components/ui/card'
import { CommandPalette } from './CommandPalette'
import { MegaMenu } from './MegaMenu'
import { MegaMenuDrawer } from './MegaMenuDrawer'

const GITHUB_URL = 'https://github.com/ankit4479/audio-converter'

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-[760px] items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-text-primary">Audio Converter</span>
          <MegaMenu />
        </div>
        <div className="flex items-center gap-2">
          <CommandPalette />
          <Badge variant="outline" className="hidden sm:inline-flex">
            Private by design
          </Badge>
          <MegaMenuDrawer />
        </div>
      </div>
    </header>
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

export function PrivacySection() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-6">
      <h2 className="text-center text-xl font-semibold text-text-primary">
        Built around one rule: your files stay yours
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {PRIVACY_POINTS.map((point) => (
          <Card key={point.title} size="sm">
            <CardContent>
              <h3 className="font-semibold text-text-primary">{point.title}</h3>
              <p className="mt-1 text-callout text-text-secondary">{point.body}</p>
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

export function HowItWorksSection() {
  return (
    <div className="mx-auto max-w-[760px] px-6 pb-6">
      <h2 className="text-center text-xl font-semibold text-text-primary">
        How it works
      </h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="text-center">
            <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-accent text-body-sm font-semibold text-accent-ink">
              {i + 1}
            </div>
            <h3 className="mt-2 font-semibold text-text-primary">{step.title}</h3>
            <p className="mt-1 text-callout text-text-secondary">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-4 text-center text-caption text-text-secondary">
      Free and open source.{' '}
      <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline">
        View the code
      </a>
    </footer>
  )
}
