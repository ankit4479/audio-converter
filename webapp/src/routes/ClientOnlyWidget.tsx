import { useSyncExternalStore, type ReactNode } from 'react'
import { LandingPage } from '../screens/LandingPage'

// No-op: whether we've mounted never changes after the fact from any external
// event, so there's nothing to subscribe to - only the getSnapshot values
// (false during/just-after prerender, true once the client re-renders) differ.
function subscribe() {
  return () => {}
}

/**
 * Prerendered routes (#25) need real, crawlable HTML - LandingPage's own static
 * shell (header, hero H1, privacy/how-it-works copy) - but the interactive
 * widget (App: useFileIntake/useConversion, both useSyncExternalStore-backed
 * with no server snapshot) can only ever run in a browser. useSyncExternalStore
 * with different client/server snapshots is React's own recipe for this
 * (unlike flipping state inside a useEffect, it doesn't force an extra
 * cascading render after mount).
 */
export function ClientOnlyWidget({ children }: { children: () => ReactNode }) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  return mounted ? children() : <LandingPage screen="setup">{null}</LandingPage>
}
