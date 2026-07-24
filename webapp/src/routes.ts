import { index, route, type RouteConfig } from '@react-router/dev/routes'
import { allEdges, edgeToSlug, edgesForCategory, allFormatNodes } from './platform/graph'

// Every entry here is a literal, statically-known path (never a `:param`
// segment) because the whole set is already enumerable from the graph at
// config time - see react-router.config.ts's prerender(), which derives its
// path list from the same three calls below, so route table and prerender
// list can never drift apart.
function categoriesWithConversions() {
  const categories = new Set(allFormatNodes().map((node) => node.category))
  return [...categories].filter((category) => edgesForCategory(category).length > 0)
}

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
