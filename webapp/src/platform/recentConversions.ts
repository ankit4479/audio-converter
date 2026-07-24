/**
 * Recently-used conversions for the Cmd+K palette (E1.3, issue #27), remembered
 * across sessions in localStorage. Only ever stores conversion slugs (e.g.
 * 'wav-to-mp3') - never a filename or anything about a file the user converted -
 * matching the project's no-file-data telemetry stance.
 */
const STORAGE_KEY = 'audio-converter:recent-conversions'
const MAX_RECENT = 5

export function getRecentConversions(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((slug) => typeof slug === 'string') : []
  } catch {
    return []
  }
}

export function recordRecentConversion(slug: string): void {
  if (typeof window === 'undefined') return
  const next = [slug, ...getRecentConversions().filter((s) => s !== slug)].slice(
    0,
    MAX_RECENT,
  )
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private-mode quota or storage disabled - recency is a nice-to-have, not required.
  }
}
