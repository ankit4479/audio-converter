import path from 'node:path'
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
  // Only for src/components/ui (shadcn/ui, the landing page's component library) -
  // shadcn's own CLI generates imports through this alias, and the rest of the app
  // keeps using its existing relative imports rather than adopting it everywhere.
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
  // Vite's default worker.format is 'iife', which can't use dynamic import() for
  // code-splitting - everything reachable from the worker, including a dynamically
  // imported WASM encoder meant to be lazy, gets forcibly inlined into one file.
  // 'es' lets the worker itself have separate chunks, same as the main thread.
  worker: { format: 'es' },
})
