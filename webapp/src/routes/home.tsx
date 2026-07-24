import { HomePage } from '../platform/HomePage'

// The index route ("/"): the platform home page (#28) - a discovery surface for
// every category, not the audio tool itself. Needs no ClientOnlyWidget gating
// (unlike hub.tsx/conversion.tsx) since HomePage has no browser-only state, so
// it prerenders for real.
export default function HomeRoute() {
  return <HomePage />
}
