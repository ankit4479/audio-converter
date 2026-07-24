import App from '../App'
import { ClientOnlyWidget } from './ClientOnlyWidget'

// The index route ("/"): same widget as before framework mode (#25), now
// reached through the router instead of main.tsx rendering it directly, and
// deferred to the client past prerender (see ClientOnlyWidget). Home redesign
// is #28's job, not this issue's.
export default function HomeRoute() {
  return <ClientOnlyWidget>{() => <App />}</ClientOnlyWidget>
}
