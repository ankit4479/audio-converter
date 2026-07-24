/**
 * The platform home page (E1.4, issue #28): a discovery surface for the whole
 * multi-category converter, not just audio - unlike the rest of the app, this
 * needs no browser-only state (no file intake, no worker-backed conversion), so
 * routes/home.tsx renders it directly rather than through ClientOnlyWidget. It
 * prerenders for real, the same way any other content page does.
 *
 * Reuses SiteHeader/PrivacySection/HowItWorksSection/SiteFooter from
 * screens/LandingPage.tsx verbatim - only the hero, search, category grid, and
 * popular strip are new. The inline search and the Cmd+K palette (#27) share the
 * exact same index (commandPaletteIndex.ts) and cmdk fuzzy engine; this is just a
 * second place to mount that engine, not a second implementation of it.
 */
import { useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { Link, useNavigate } from 'react-router'
import {
  HowItWorksSection,
  PrivacySection,
  SiteFooter,
  SiteHeader,
} from '../screens/LandingPage'
import { buildPaletteIndex, type PaletteEntry } from './commandPaletteIndex'
import { allEdges, edgeLabel, edgesForCategory, edgeToSlug } from './graph'
import { CATEGORY_LABELS } from './MegaMenu'
import type { CategoryId } from './module'

// CATEGORY_LABELS is keyed by every CategoryId, so its keys are the canonical
// list of all 6 categories - one source, not a second hardcoded array that could
// drift from it.
const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as CategoryId[]

// MP3 is already this app's own default output target (see convert.ts) - "what
// most people convert to" isn't a guess, it's the same choice the app already
// makes. Graph-derived rather than a hand-picked list of slugs, so it stays
// truthful if the graph ever drops one of these targets.
const POPULAR_TARGET = 'mp3'

function popularConversions() {
  return allEdges()
    .filter((edge) => edge.to === POPULAR_TARGET)
    .map((edge) => ({
      slug: edgeToSlug(edge.from, edge.to),
      label: edgeLabel(edge.from, edge.to),
    }))
}

export function HomePage() {
  return (
    <div className="min-h-screen bg-surface-page">
      <SiteHeader />
      <HomeHero />
      <CategoryGrid />
      <PopularStrip />
      <PrivacySection />
      <HowItWorksSection />
      <SiteFooter />
    </div>
  )
}

function HomeHero() {
  return (
    <div className="mx-auto max-w-[760px] px-6 pb-8 pt-12 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
        Convert anything. Nothing leaves your device.
      </h1>
      <p className="mx-auto mt-3 max-w-[480px] text-body-lg text-text-secondary">
        Drop a file, pick a format, get it back, right in this tab. No account, no upload,
        no catch.
      </p>
      <p className="mt-2 text-body-sm text-text-secondary">
        Open your browser&apos;s Network tab while you convert. Nothing gets sent.
      </p>
      <div className="mx-auto mt-6 max-w-[480px]">
        <HomeSearch />
      </div>
    </div>
  )
}

function HomeSearch() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const entries = useMemo(() => buildPaletteIndex(), [])

  function selectEntry(entry: PaletteEntry) {
    setQuery('')
    navigate(entry.href)
  }

  return (
    <Command
      label="Search conversions"
      className="relative rounded-card border border-border bg-surface text-left shadow-sm"
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="What do you want to convert? e.g. wav to mp3"
        className="w-full bg-transparent px-4 py-3 text-body text-text-primary outline-none placeholder:text-text-secondary"
      />
      {query.trim().length > 0 && (
        <Command.List className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-card border border-border bg-surface p-2 shadow-lg">
          <Command.Empty className="px-3 py-4 text-center text-body-sm text-text-secondary">
            No matching conversion.
          </Command.Empty>
          {entries.map((entry) => (
            <Command.Item
              key={entry.slug}
              value={entry.label}
              keywords={[...entry.keywords]}
              onSelect={() => selectEntry(entry)}
              className="cursor-pointer rounded-chip px-3 py-2 text-body-sm text-text-primary aria-selected:bg-surface-page"
            >
              {entry.label}
            </Command.Item>
          ))}
        </Command.List>
      )}
    </Command>
  )
}

function CategoryGrid() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-6">
      <h2 className="text-center text-xl font-semibold text-text-primary">
        Browse by category
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {ALL_CATEGORIES.map((category) => {
          const count = edgesForCategory(category).length
          const label = CATEGORY_LABELS[category]
          if (count === 0) {
            return (
              <div
                key={category}
                className="rounded-card border border-dashed border-border p-4 text-center opacity-60"
              >
                <p className="font-semibold text-text-primary">{label}</p>
                <p className="mt-1 text-caption text-text-secondary">Coming soon</p>
              </div>
            )
          }
          return (
            <Link
              key={category}
              to={`/${category}-converter`}
              className="rounded-card border border-border p-4 text-center hover:border-accent"
            >
              <p className="font-semibold text-text-primary">{label}</p>
              <p className="mt-1 text-caption text-text-secondary">
                {count} conversion{count === 1 ? '' : 's'}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function PopularStrip() {
  const popular = popularConversions()
  if (popular.length === 0) return null

  return (
    <div className="mx-auto max-w-[760px] px-6 pb-6">
      <h2 className="text-center text-xl font-semibold text-text-primary">
        Popular converters
      </h2>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {popular.map((entry) => (
          <Link
            key={entry.slug}
            to={`/${entry.slug}`}
            className="rounded-chip border border-border px-3 py-1.5 text-body-sm text-text-primary hover:border-accent"
          >
            {entry.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
