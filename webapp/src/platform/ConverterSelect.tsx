/**
 * "Select which converter" (E1.5, issue #29): the primary way into a specific
 * converter from the home page and from a category hub. Pick what you have, then
 * click what you want it to become.
 *
 * The targets are real <Link>s to the prerendered per-conversion pages, not a
 * click handler that navigates - the whole reason those URLs exist is that Google
 * and AI answer engines can index and cite one page per conversion (see #25 and
 * the design comment on #29), and a crawler follows an href, not an onClick. The
 * source picker is a plain <select> for the same reason it is elsewhere in this
 * app: it is a short, known list, and the native control is already accessible
 * and keyboard-operable.
 *
 * Deliberately not a second search box. HomePage's fuzzy input and the Cmd+K
 * palette (#27) both already search every conversion by name from one shared
 * index; this is the browse path for someone who knows their input format but
 * not what to convert it to.
 */
import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { SelectChevron } from '../components/SelectChevron'
import { sourceFormats, targetsForSource } from './converterTargets'
import type { CategoryId } from './module'

export function ConverterSelect({ category }: { category?: CategoryId } = {}) {
  const sources = useMemo(() => sourceFormats(category), [category])
  // Preselecting the first source (rather than an empty "choose one" state) means
  // the target links are in the page from the first paint, so they are in the
  // prerendered HTML too and a visitor sees what this control does without
  // touching it.
  const [source, setSource] = useState(sources[0]?.from ?? '')
  const targets = useMemo(() => targetsForSource(source), [source])
  const selectId = useId()

  if (sources.length === 0) return null

  return (
    <div className="rounded-card border border-border bg-surface p-4 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={selectId}
          className="text-body-sm font-semibold text-text-primary"
        >
          What do you have?
        </label>
        <div className="relative">
          <select
            id={selectId}
            className="appearance-none rounded-chip border border-border bg-surface py-1 pl-2 pr-7 text-text-primary"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            {sources.map((option) => (
              <option key={option.from} value={option.from}>
                {option.label}
              </option>
            ))}
          </select>
          <SelectChevron />
        </div>
      </div>
      {targets.length > 0 && (
        <>
          <p className="mt-3 text-caption text-text-secondary">Convert it to</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {targets.map((target) => (
              <Link
                key={target.slug}
                to={target.href}
                className="rounded-chip border border-border px-3 py-1.5 text-body-sm font-medium text-text-primary hover:border-accent hover:text-accent"
              >
                {target.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
