/**
 * Cmd+K / Ctrl+K command palette (E1.3, issue #27): fuzzy search over every
 * conversion in the graph, present on every page next to MegaMenu (#26) in
 * SiteHeader. Entries come from buildPaletteIndex() (commandPaletteIndex.ts);
 * matching and ranking are cmdk's own command-score filter via each item's
 * `keywords`, not a hand-rolled fuzzy matcher. Command.Dialog wraps Radix
 * Dialog, so Escape-to-close, focus trapping, and aria-modal come for free -
 * the same foundation MegaMenuDrawer already relies on.
 */
import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router'
import { buildPaletteIndex, type PaletteEntry } from './commandPaletteIndex'
import { CATEGORY_LABELS } from './MegaMenu'
import { getRecentConversions, recordRecentConversion } from './recentConversions'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const entries = useMemo(() => buildPaletteIndex(), [])
  const entriesBySlug = useMemo(() => new Map(entries.map((e) => [e.slug, e])), [entries])

  // Read once per open rather than on every keystroke - the list only needs to
  // reflect what was recent when the palette was opened, and re-reading on each
  // render would fight the "most recent first" ordering as selections happen.
  const recentSlugs = useMemo(() => (open ? getRecentConversions() : []), [open])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function selectEntry(entry: PaletteEntry) {
    recordRecentConversion(entry.slug)
    setOpen(false)
    navigate(entry.href)
  }

  const recentEntries = recentSlugs
    .map((slug) => entriesBySlug.get(slug))
    .filter((entry): entry is PaletteEntry => entry !== undefined)

  const entriesByCategory = new Map<PaletteEntry['category'], PaletteEntry[]>()
  for (const entry of entries) {
    const group = entriesByCategory.get(entry.category)
    if (group) group.push(entry)
    else entriesByCategory.set(entry.category, [entry])
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-chip border border-border px-3 py-1.5 text-body-sm text-text-secondary hover:text-text-primary"
      >
        <span>Search conversions</span>
        <kbd className="rounded border border-border px-1.5 py-0.5 text-caption text-text-secondary">
          &#8984;K
        </kbd>
      </button>
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search conversions"
        overlayClassName="fixed inset-0 z-40 bg-black/40"
        contentClassName="fixed left-1/2 top-24 z-50 w-[90vw] max-w-lg -translate-x-1/2 outline-none"
        className="overflow-hidden rounded-card border border-border bg-surface shadow-lg"
      >
        <Command.Input
          autoFocus
          placeholder="Search a conversion, e.g. wav to mp3"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-body text-text-primary outline-none placeholder:text-text-secondary"
        />
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-body-sm text-text-secondary">
            No matching conversion.
          </Command.Empty>
          {recentEntries.length > 0 && (
            <Command.Group
              heading="Recent"
              className="px-2 py-1 text-caption font-semibold uppercase tracking-wide text-text-secondary"
            >
              {recentEntries.map((entry) => (
                <Command.Item
                  key={`recent-${entry.slug}`}
                  // The slug, not `recent <label>`: cmdk needs a value distinct
                  // from the same conversion's entry in its category group below,
                  // but it also scores the query against `value`, so the literal
                  // word "recent" in there would make typing "rec" match every
                  // recent item. The slug is both unique and a real thing to
                  // search for.
                  value={entry.slug}
                  keywords={[...entry.keywords]}
                  onSelect={() => selectEntry(entry)}
                  className="cursor-pointer rounded-chip px-3 py-2 text-body-sm text-text-primary aria-selected:bg-surface-page"
                >
                  {entry.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {[...entriesByCategory.entries()].map(([category, categoryEntries]) => (
            <Command.Group
              key={category}
              heading={CATEGORY_LABELS[category]}
              className="px-2 py-1 text-caption font-semibold uppercase tracking-wide text-text-secondary"
            >
              {categoryEntries.map((entry) => (
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
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </>
  )
}
