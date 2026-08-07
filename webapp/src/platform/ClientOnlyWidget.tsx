import { useSyncExternalStore, type ReactNode } from 'react'

// No-op: whether we've mounted never changes after the fact from any external
// event, so there's nothing to subscribe to - only the getSnapshot values
// (false during/just-after prerender, true once the client re-renders) differ.
function subscribe() {
  return () => {}
}

/**
 * Renders its children only in a browser. The interactive converter widget
 * (useFileIntake/useConversion, both useSyncExternalStore-backed with no server
 * snapshot) can't run during the prerender pass (#25), while everything a crawler
 * needs to see - header, the page's h1, footer - is static and must.
 *
 * Which is why this renders nothing on the server rather than a placeholder shell:
 * since E1.5 (issue #29) that crawlable frame lives outside this boundary, in
 * ConverterShell, instead of this component having to stand in for it.
 *
 * useSyncExternalStore with different client/server snapshots is React's own
 * recipe for this - unlike flipping state inside a useEffect, it doesn't force an
 * extra cascading render after mount.
 */
export function ClientOnlyWidget({ children }: { children: () => ReactNode }) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  return mounted ? children() : null
}
