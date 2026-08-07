/**
 * Cmd+K search index (E1.3, issue #27): one entry per conversion edge, built from
 * the same graph/registry source of truth as MegaMenu (#26) - adding an edge grows
 * the palette with no change here. Kept free of React and of cmdk itself so the
 * index can be unit tested without mounting the palette UI; CommandPalette.tsx
 * hands these entries straight to cmdk's own (command-score) fuzzy filter via each
 * Command.Item's `keywords`, rather than hand-rolling a second fuzzy matcher.
 */
import { liveCategories } from './converterTargets'
import type { CategoryId } from './module'
import { edgesForCategory, edgeLabel, edgeToSlug, formatNode } from './graph'

export interface PaletteEntry {
  readonly slug: string
  readonly label: string
  readonly category: CategoryId
  readonly href: string
  /** Extra terms cmdk should match on beyond the visible label - format ids,
   *  labels, and file extensions on both ends of the conversion (e.g. 'heic',
   *  'HEIC', 'jpg') so a query for either side's alias finds the edge. */
  readonly keywords: readonly string[]
}

/** Same live-category gate MegaMenu/route generation already use, so the palette
 *  never offers a conversion that has no page to land on. */
export function buildPaletteIndex(): PaletteEntry[] {
  return liveCategories().flatMap((category) =>
    edgesForCategory(category).map((edge) => {
      const from = formatNode(edge.from)
      const to = formatNode(edge.to)
      const fromLabel = from?.label ?? edge.from
      const toLabel = to?.label ?? edge.to
      const slug = edgeToSlug(edge.from, edge.to)
      return {
        slug,
        label: edgeLabel(edge.from, edge.to),
        category,
        href: `/${slug}`,
        keywords: [
          edge.from,
          edge.to,
          fromLabel,
          toLabel,
          ...(from?.extensions ?? []),
          ...(to?.extensions ?? []),
        ],
      }
    }),
  )
}
