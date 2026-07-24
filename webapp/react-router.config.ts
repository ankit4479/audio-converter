import type { Config } from '@react-router/dev/config'
import { allEdges, categoriesWithConversions, edgeToSlug } from './src/platform/graph'

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
