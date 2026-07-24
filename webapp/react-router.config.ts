import type { Config } from '@react-router/dev/config'
import {
  allEdges,
  allFormatNodes,
  edgesForCategory,
  edgeToSlug,
} from './src/platform/graph'

// No server: every route ships as static HTML at build time (issue #25). The
// converter itself already runs entirely client-side (WebCodecs/WASM), so there
// is nothing an SSR runtime would do here beyond serving files.
//
// @react-router/dev still needs @react-router/node present in package.json's
// "dependencies" (not devDependencies) to run its own build-time prerender
// pass, even though ssr:false means nothing from it ships or runs in
// production - it's the tool's own server-runtime-detection requirement, not
// a real runtime dependency of this static site.
const ssr = false

// A category only gets a hub page once some module actually serves it - today
// that's audio alone, matching graph.ts's comment that non-audio categories are
// present as FormatNode/CategoryId scaffolding but have no real edges yet.
function categoriesWithConversions() {
  const categories = new Set(allFormatNodes().map((node) => node.category))
  return [...categories].filter((category) => edgesForCategory(category).length > 0)
}

async function prerender() {
  const home = ['/']
  const hubs = categoriesWithConversions().map((category) => `/${category}-converter`)
  const conversions = allEdges().map((edge) => `/${edgeToSlug(edge.from, edge.to)}`)
  return [...home, ...hubs, ...conversions]
}

export default {
  appDirectory: 'src',
  ssr,
  prerender,
} satisfies Config
