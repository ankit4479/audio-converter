import { useLocation } from 'react-router'
import type { CodecId } from '../engine/codec'
import { ConverterShell } from '../platform/ConverterShell'
import { edgeLabel, slugToEdge } from '../platform/graph'

// Specific conversion routes (e.g. /wav-to-mp3): routes.ts generates one static
// path per graph edge rather than a single `/:from-to-:to` pattern (react-router
// can't mix literal text with a param in one segment), so there is no route
// param carrying which edge this is. Recovering it from the URL via
// slugToEdge - the same function that generated the path - keeps route table
// and page content from ever disagreeing about what a given path means.
//
// Since E1.5 (issue #29) the page shows its converter immediately under a
// conversion-specific h1, and hands the edge's `from` to the shell so changing the
// output format there becomes a navigation to that other conversion's own page
// rather than a silent content swap.
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
  const target = edge.to as CodecId
  return (
    <ConverterShell
      moduleId={edge.moduleId}
      heading={`${edgeLabel(edge.from, edge.to)} Converter`}
      source={edge.from}
      target={target}
    />
  )
}
