import { index, route, type RouteConfig } from '@react-router/dev/routes'
import { allEdges, categoriesWithConversions, edgeToSlug } from './platform/graph'

// Every entry here is a literal, statically-known path (never a `:param`
// segment) because the whole set is already enumerable from the graph at
// config time - see react-router.config.ts's prerender(), which derives its
// path list from the same categoriesWithConversions()/allEdges() calls, so
// route table and prerender list can never drift apart.
const hubRoutes = categoriesWithConversions().map((category) =>
  route(`/${category}-converter`, 'routes/hub.tsx', { id: `hub-${category}` }),
)

const conversionRoutes = allEdges().map((edge) => {
  const slug = edgeToSlug(edge.from, edge.to)
  return route(`/${slug}`, 'routes/conversion.tsx', { id: `conversion-${slug}` })
})

export default [
  index('routes/home.tsx'),
  ...hubRoutes,
  ...conversionRoutes,
] satisfies RouteConfig
