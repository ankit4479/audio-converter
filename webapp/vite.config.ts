import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Cross-origin isolation is required for multi-threaded WASM (SharedArrayBuffer).
// Set here in dev so `crossOriginIsolated` behaves the same as it will once the
// production host (see issue #18) sends the same two headers.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
  // Vite's default worker.format is 'iife', which can't use dynamic import() for
  // code-splitting - everything reachable from the worker, including a dynamically
  // imported WASM encoder meant to be lazy, gets forcibly inlined into one file.
  // 'es' lets the worker itself have separate chunks, same as the main thread.
  worker: { format: 'es' },
})
