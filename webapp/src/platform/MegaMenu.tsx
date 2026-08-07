/**
 * Global mega-menu (E1.2, issue #26): the FreeConvert-style top nav, present on
 * every page via SiteChrome's SiteHeader. Generated entirely from the registry
 * and graph - adding a module/edge grows the menu with no change here. A
 * category only gets a column once it has both a registered module (registry.
 * byCategory) and at least one real conversion (graph.categoriesWithConversions/
 * edgesForCategory): today that's audio alone, matching #25's route generation,
 * which gates the same way.
 */
import { NavigationMenu } from 'radix-ui'
import { Link } from 'react-router'
import { liveCategories } from './converterTargets'
import type { CategoryId } from './module'
import {
  edgesForCategory,
  edgeToSlug,
  formatNode,
  hubPath,
  type ConversionEdge,
} from './graph'

// Exported for CommandPalette (#27), which needs the same category labels for its
// result groups - one label set, not a second copy to drift out of sync.
export const CATEGORY_LABELS: Record<CategoryId, string> = {
  audio: 'Audio',
  image: 'Image',
  video: 'Video',
  gif: 'GIF',
  pdf: 'PDF & Documents',
  archive: 'Archive',
}

interface FormatGroup {
  readonly from: string
  readonly fromLabel: string
  readonly targets: ReadonlyArray<{ readonly slug: string; readonly label: string }>
}

export interface MenuCategory {
  readonly id: CategoryId
  readonly label: string
  readonly hubHref: string
  readonly groups: readonly FormatGroup[]
}

function groupByFromFormat(edges: readonly ConversionEdge[]): FormatGroup[] {
  const byFrom = new Map<string, ConversionEdge[]>()
  for (const edge of edges) {
    const group = byFrom.get(edge.from)
    if (group) group.push(edge)
    else byFrom.set(edge.from, [edge])
  }
  return [...byFrom.entries()].map(([from, fromEdges]) => ({
    from,
    fromLabel: formatNode(from)?.label ?? from,
    targets: fromEdges.map((edge) => ({
      slug: edgeToSlug(edge.from, edge.to),
      label: formatNode(edge.to)?.label ?? edge.to,
    })),
  }))
}

/** Exported for MegaMenuDrawer (the mobile counterpart) so both read the exact
 *  same category list rather than each re-deriving it. */
export function menuCategories(): MenuCategory[] {
  return liveCategories().map((category) => ({
    id: category,
    label: CATEGORY_LABELS[category],
    hubHref: hubPath(category),
    groups: groupByFromFormat(edgesForCategory(category)),
  }))
}

export function MegaMenu() {
  const categories = menuCategories()
  if (categories.length === 0) return null

  return (
    <NavigationMenu.Root
      aria-label="Converter categories"
      className="relative hidden md:block"
    >
      <NavigationMenu.List className="flex list-none items-center gap-1">
        {categories.map((category) => (
          <NavigationMenu.Item key={category.id}>
            <NavigationMenu.Trigger className="rounded-chip px-3 py-2 text-body-sm font-medium text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent data-[state=open]:text-text-primary">
              {category.label}
            </NavigationMenu.Trigger>
            <NavigationMenu.Content className="absolute top-full start-0 w-max max-w-[90vw] rounded-card border border-border bg-surface p-4 shadow-lg">
              <Link
                to={category.hubHref}
                className="mb-3 inline-block text-body-sm font-semibold text-accent hover:text-accent-hover"
              >
                All {category.label} converters
              </Link>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
                {category.groups.map((group) => (
                  <div key={group.from}>
                    <p className="text-caption font-semibold uppercase tracking-wide text-text-secondary">
                      From {group.fromLabel}
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {group.targets.map((target) => (
                        <li key={target.slug}>
                          <NavigationMenu.Link asChild>
                            <Link
                              to={`/${target.slug}`}
                              className="text-body-sm text-text-primary hover:text-accent"
                            >
                              {target.label}
                            </Link>
                          </NavigationMenu.Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        ))}
      </NavigationMenu.List>
      <NavigationMenu.Viewport className="absolute top-full start-0" />
    </NavigationMenu.Root>
  )
}
