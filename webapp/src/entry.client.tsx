import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'
import { TokenPreview } from './dev/TokenPreview.tsx'
import { detectAudioEncoders } from './engine/webcodecs.ts'

// Dev-only escape hatch to the token comparison page (issue #2's acceptance
// criterion), reachable at /?tokens. Never linked to from the app itself. Kept
// out of the route table entirely - it renders in place of the router, same as
// it did in place of <App/> before framework mode (#25) replaced main.tsx.
const showTokenPreview =
  import.meta.env.DEV && new URLSearchParams(location.search).has('tokens')

// Issue #6's acceptance criterion: detection results are logged once at startup.
// Client-only entry point, so this never runs during the build's prerender pass.
void detectAudioEncoders()

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>{showTokenPreview ? <TokenPreview /> : <HydratedRouter />}</StrictMode>,
  )
})
