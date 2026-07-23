import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TokenPreview } from './dev/TokenPreview.tsx'
import { detectAudioEncoders } from './engine/webcodecs.ts'

// Dev-only escape hatch to the token comparison page (issue #2's acceptance
// criterion), reachable at /?tokens. Never linked to from the app itself.
const showTokenPreview =
  import.meta.env.DEV && new URLSearchParams(location.search).has('tokens')

// Issue #6's acceptance criterion: detection results are logged once at startup.
// Fire-and-forget - issue #13's UI will consume detectAudioEncoders() directly once
// it exists; this line's only job is making sure the probe actually runs on load.
void detectAudioEncoders()

createRoot(document.getElementById('root')!).render(
  <StrictMode>{showTokenPreview ? <TokenPreview /> : <App />}</StrictMode>,
)
