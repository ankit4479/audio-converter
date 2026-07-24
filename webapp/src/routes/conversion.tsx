import { useLocation } from 'react-router'
import App from '../App'
import type { CodecId } from '../engine/codec'
import { slugToEdge } from '../platform/graph'
import { ClientOnlyWidget } from './ClientOnlyWidget'

// Specific conversion routes (e.g. /wav-to-mp3): routes.ts generates one static
// path per graph edge rather than a single `/:from-to-:to` pattern (react-router
// can't mix literal text with a param in one segment), so there is no route
// param carrying which edge this is. Recovering it from the URL via
// slugToEdge - the same function that generated the path - keeps route table
// and page content from ever disagreeing about what a given path means.
export default function ConversionRoute() {
  const { pathname } = useLocation()
  // Static hosts (and vite preview, serving each prerendered .../index.html)
  // commonly request the trailing-slash form of a path - strip both edges
  // rather than assuming an exact "/wav-to-mp3" match.
  const slug = pathname.replace(/^\/+|\/+$/g, '')
  const edge = slugToEdge(slug)
  // Only reachable via a path routes.ts actually generated from a real edge, so
  // this should never happen - but if the graph and route table ever drift,
  // fail loudly on the widget rather than convert to the wrong format silently.
  if (!edge) throw new Error(`No conversion for path "${pathname}"`)

  // graph.ts's FormatId is a plain string (it also labels not-yet-encodable
  // codecs), but edge.to specifically can only be one of AUDIO_ENCODABLE_TARGETS
  // - a real CodecId - since AUDIO_EDGES only ever targets that set.
  const codec = edge.to as CodecId
  return <ClientOnlyWidget>{() => <App initialSettings={{ codec }} />}</ClientOnlyWidget>
}
