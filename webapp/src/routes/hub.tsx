import { useLocation } from 'react-router'
import { ConverterSelect } from '../platform/ConverterSelect'
import { ConverterShell } from '../platform/ConverterShell'
import { categoryForHubPath } from '../platform/graph'
import { CATEGORY_LABELS } from '../platform/MegaMenu'
import { byCategory } from '../platform/registry'

// Category hub routes (e.g. /audio-converter). routes.ts generates one literal
// path per live category rather than a `/:category-converter` pattern
// (react-router can't mix literal text with a param in one segment), so there is
// no route param saying which category this is - categoryForHubPath recovers it
// from the URL, the inverse of the hubPath() that generated the path.
//
// Since E1.5 (issue #29) this renders the converter straight away under its own
// h1, with no repeated hero/privacy/how-it-works pitch and no "Start converting"
// gate: someone who already picked a category shouldn't have to sit through the
// home page's argument a second time.
export default function HubRoute() {
  const { pathname } = useLocation()
  const category = categoryForHubPath(pathname)
  // Only reachable via a path routes.ts generated from a live category, so this
  // should never happen - fail loudly rather than render a converter for a
  // category we can't name.
  if (!category) throw new Error(`No category for path "${pathname}"`)

  // A live category always has at least one registered module (that is what makes
  // it live - see converterTargets.liveCategories), and today never more than one.
  const [module] = byCategory(category)
  if (!module) throw new Error(`No module registered for category "${category}"`)

  return (
    <ConverterShell
      moduleId={module.id}
      heading={`${CATEGORY_LABELS[category]} Converter`}
      intro={<ConverterSelect category={category} />}
    />
  )
}
