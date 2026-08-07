/**
 * Converter selection data (E1.5, issue #29): which source formats a visitor can
 * start from, and which targets each one can reach. Every converter selection in
 * the app - the home/hub source picker (ConverterSelect) and the in-widget
 * "Convert to" control (ConverterShell) - reads its options from here, so both
 * offer exactly the same set and land on exactly the same URLs.
 *
 * Kept free of React so the selection rules are unit testable without mounting
 * any UI, the same split platform/commandPaletteIndex.ts already uses.
 */
import {
  categoriesWithConversions,
  edgesForCategory,
  edgeToSlug,
  formatNode,
  type ConversionEdge,
} from './graph'
import type { CategoryId, FormatId } from './module'
import { byCategory } from './registry'

export interface ConverterSource {
  readonly from: FormatId
  readonly label: string
  readonly category: CategoryId
}

export interface ConverterTarget {
  readonly to: FormatId
  readonly label: string
  readonly slug: string
  /** Path of the prerendered page for this conversion, e.g. '/wav-to-mp3'. */
  readonly href: string
  /** Which module owns the conversion. The shell doesn't read it - it navigates to
   *  `href`, and the route there resolves the module from the edge itself - so this
   *  is here for callers that need to know what a target would switch to (a
   *  cross-module warning, grouping targets by module) without re-querying the
   *  graph. */
  readonly moduleId: string
}

/**
 * Categories that are genuinely usable right now: they have a registered module
 * AND at least one conversion in the graph. This was being re-derived
 * independently in MegaMenu.menuCategories() and buildPaletteIndex(); both now
 * call this, so a category can never be live in the nav and dead in the palette
 * (or vice versa).
 */
export function liveCategories(): readonly CategoryId[] {
  return categoriesWithConversions().filter((category) => byCategory(category).length > 0)
}

/** Every live edge tagged with the category it was found under, so callers never
 *  have to re-derive a category from an edge's `from` node. */
function liveEdges(
  category?: CategoryId,
): ReadonlyArray<{ edge: ConversionEdge; category: CategoryId }> {
  return liveCategories()
    .filter((live) => category === undefined || live === category)
    .flatMap((live) => edgesForCategory(live).map((edge) => ({ edge, category: live })))
}

/** Every format a conversion can start from, optionally narrowed to one category
 *  (the hub pages, which only ever offer their own category's sources). Ordered
 *  by the graph's own edge order and deduplicated, so a format with several
 *  targets appears once. */
export function sourceFormats(category?: CategoryId): readonly ConverterSource[] {
  const seen = new Set<FormatId>()
  const sources: ConverterSource[] = []
  for (const { edge, category: edgeCategory } of liveEdges(category)) {
    if (seen.has(edge.from)) continue
    seen.add(edge.from)
    sources.push({
      from: edge.from,
      label: formatNode(edge.from)?.label ?? edge.from,
      category: edgeCategory,
    })
  }
  return sources
}

/** Everything the given format can be converted into. Empty for a format with no
 *  outgoing edge (a nominal source label only), which is a real case the callers
 *  have to render rather than an error. */
export function targetsForSource(from: FormatId): readonly ConverterTarget[] {
  return liveEdges()
    .filter(({ edge }) => edge.from === from)
    .map(({ edge }) => {
      const slug = edgeToSlug(edge.from, edge.to)
      return {
        to: edge.to,
        label: formatNode(edge.to)?.label ?? edge.to,
        slug,
        href: `/${slug}`,
        moduleId: edge.moduleId,
      }
    })
}

/** The one target of `from` that produces `to`, or undefined when no such
 *  conversion exists - what the in-widget picker needs to tell "this format
 *  change is a real page to navigate to" apart from "this format change can only
 *  be a settings change". */
export function targetForEdge(from: FormatId, to: FormatId): ConverterTarget | undefined {
  return targetsForSource(from).find((target) => target.to === to)
}
