import App from '../App'
import { ClientOnlyWidget } from './ClientOnlyWidget'

// Category hub routes (e.g. /audio-converter): today there's exactly one
// category with any real conversions, so this renders the same widget as home.
// Distinct hub content (category-specific copy, a filtered format list) is the
// mega-menu/home-redesign work in #26 and #28, not this issue's scope - #25
// only needs the route to exist, prerender with real content, and work.
export default function HubRoute() {
  return <ClientOnlyWidget>{() => <App />}</ClientOnlyWidget>
}
