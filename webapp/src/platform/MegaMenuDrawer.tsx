/**
 * Mobile counterpart to MegaMenu (E1.2, issue #26): the same categories/
 * conversions, collapsed into an accessible drawer below md (MegaMenu's own
 * breakpoint - see its `hidden md:block`). Radix Dialog gives focus trapping,
 * Escape-to-close, and aria-modal for free; each category is a native
 * <details> accordion rather than more Radix/ARIA wiring, since disclosure
 * widgets are exactly what <details>/<summary> are for.
 */
import { useState } from 'react'
import { Dialog } from 'radix-ui'
import { Link } from 'react-router'
import { menuCategories } from './MegaMenu'

export function MegaMenuDrawer() {
  const categories = menuCategories()
  const [open, setOpen] = useState(false)
  if (categories.length === 0) return null

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Browse converters"
          className="rounded-chip p-2 text-text-secondary hover:text-text-primary md:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 6h16M4 12h16M4 18h16"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 start-0 z-50 flex w-[85vw] max-w-sm flex-col gap-1 overflow-y-auto bg-surface-page p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="text-body font-semibold text-text-primary">
              Converters
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded-chip p-2 text-text-secondary hover:text-text-primary"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </Dialog.Close>
          </div>
          {categories.map((category) => (
            <details key={category.id} className="rounded-chip border border-border p-2">
              <summary className="cursor-pointer text-body-sm font-medium text-text-primary">
                {category.label}
              </summary>
              <Link
                to={category.hubHref}
                onClick={() => setOpen(false)}
                className="mt-2 block text-body-sm font-semibold text-accent"
              >
                All {category.label} converters
              </Link>
              <div className="mt-2 flex flex-col gap-2">
                {category.groups.map((group) => (
                  <div key={group.from}>
                    <p className="text-caption font-semibold uppercase tracking-wide text-text-secondary">
                      From {group.fromLabel}
                    </p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {group.targets.map((target) => (
                        <li key={target.slug}>
                          <Link
                            to={`/${target.slug}`}
                            onClick={() => setOpen(false)}
                            className="text-body-sm text-text-primary"
                          >
                            {target.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
