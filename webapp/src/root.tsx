import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import './index.css'
// Registers every built-in module (modules/register.ts's side effect) once, for
// every route - previously only routes that imported App.tsx got this for free,
// which silently broke SiteHeader's MegaMenu/MegaMenuDrawer (both read the
// registry) on HomePage (#28), the first route with no App.tsx import at all.
// Root wraps every route (see routes.ts), so this is the one place that can't
// be skipped no matter which page component a route renders.
import './modules/register'

// Site-wide tags carried over from the old index.html - framework mode (#25)
// generates the document itself from this component instead of a static HTML
// file, so anything that lived in <head> moves here. Per-route <title>/
// description overrides are #30's job (SEO page template), not this issue's.
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Audio Converter</title>
        <meta
          name="description"
          content="Convert audio files between MP3, AAC, FLAC, WAV, Opus, and more, right in your browser. Nothing ever uploads."
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Audio Converter" />
        <meta
          property="og:description"
          content="Convert audio files between MP3, AAC, FLAC, WAV, Opus, and more, right in your browser. Nothing ever uploads."
        />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Audio Converter" />
        <meta
          name="twitter:description"
          content="Convert audio files between MP3, AAC, FLAC, WAV, Opus, and more, right in your browser. Nothing ever uploads."
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function Root() {
  return <Outlet />
}
