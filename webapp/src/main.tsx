import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TokenPreview } from './dev/TokenPreview.tsx'

// Dev-only escape hatch to the token comparison page (issue #2's acceptance
// criterion), reachable at /?tokens. Never linked to from the app itself.
const showTokenPreview =
  import.meta.env.DEV && new URLSearchParams(location.search).has('tokens')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{showTokenPreview ? <TokenPreview /> : <App />}</StrictMode>,
)
